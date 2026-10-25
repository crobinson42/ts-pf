import { type AnySchema, validateSchema } from '@ts-pf/contract'
import { PFError } from '@ts-pf/protocol'
import type { BoundTool } from './bound-tool.js'
import { errorText, type McpOnError, reportError } from './error-text.js'
import type { Executor } from './executor.js'
import { errorResult, successResult } from './result.js'
import type { MapperOpts, ToolSpec } from './tool.js'
import type { McpCallInfo, McpToolResult } from './types.js'

export type CallOptions = {
  readonly executor: Executor
  readonly onError: McpOnError | undefined
  readonly maxResultChars: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function parse(schema: AnySchema, value: unknown): Promise<unknown> {
  const result = await validateSchema(schema, value)
  if (!result.success) {
    throw new PFError({
      code: 'VALIDATION',
      message: 'Validation failed',
      data: { issues: result.issues },
    })
  }
  return result.value
}

/** Model arguments → procedure input: `.input()` map, or the arguments plus injected keys. */
async function procedureInput(
  spec: ToolSpec,
  args: unknown,
  opts: MapperOpts<unknown, unknown>,
): Promise<unknown> {
  if (spec.input?.map) {
    return spec.input.map(await parse(spec.input.schema, args), opts)
  }
  if (spec.procedure?.['~pf'].input === undefined) return undefined
  const keys = Object.keys(spec.inject)
  if (keys.length === 0) return args ?? {}
  // Injected values always win over anything the model sent under that key.
  const input: Record<string, unknown> = isRecord(args) ? { ...args } : {}
  for (const key of keys) {
    input[key] = await spec.inject[key]?.({
      context: opts.context,
      info: opts.info,
    })
  }
  return input
}

async function execute(
  tool: BoundTool,
  args: unknown,
  opts: MapperOpts<unknown, unknown>,
  executor: Executor,
): Promise<unknown> {
  const { spec } = tool
  if (spec.run) {
    const input = spec.input ? await parse(spec.input.schema, args) : args
    return spec.run({ ...opts, input })
  }
  const input = await procedureInput(spec, args, opts)
  const output = await executor.run(spec.path, input, opts.context, opts.info)
  if (!spec.output) return output
  const mapped = await spec.output.map(output, opts)
  if (!spec.output.schema) return mapped
  const result = await validateSchema(spec.output.schema, mapped)
  if (!result.success) {
    // A server bug: the model gets INTERNAL; `cause` (the issues) is for the log only.
    throw new PFError({
      code: 'INTERNAL',
      message: 'Internal server error',
      cause: result.issues,
    })
  }
  return result.value
}

/** Run one tool: context, inject / input map, procedure, output map + check, then errors → next-step text. */
export async function callTool(
  tool: BoundTool,
  args: unknown,
  info: McpCallInfo,
  options: CallOptions,
): Promise<McpToolResult> {
  const callInfo: McpCallInfo = {
    ...info,
    tool: { name: tool.name, path: tool.spec.path },
  }
  let context: unknown
  try {
    context = await options.executor.context(callInfo)
    const opts = {
      context,
      info: callInfo,
      call: options.executor.client(context, callInfo),
    }
    const value = await execute(tool, args, opts, options.executor)
    return successResult(value, options.maxResultChars, tool.structured)
  } catch (error) {
    let reported = error
    let text: string
    try {
      text = errorText(error, {
        name: tool.name,
        schema: tool.inputSchema,
        errors: tool.spec.errors,
        context,
      })
    } catch (mapperError) {
      reported = mapperError
      text = errorText(mapperError, {
        name: tool.name,
        schema: tool.inputSchema,
        errors: {},
        context,
      })
    }
    reportError(reported, callInfo, options.onError)
    return errorResult(text, options.maxResultChars)
  }
}
