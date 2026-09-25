import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'

export const name = 'dsh-response-end-gate'
export const inject = ['systemPrompt', 'tools']

export const Config = z.object({
  enabled: z.boolean().default(true).volatile(),
})

const SECTION_NAME = 'response-end:gate'
const SECTION_ORDER = 150
const TOOL_NAME = 'response_end'

const RULE_TEXT = [
  'This session enforces a strict turn-ending rule.',
  'You may only finish a reply by calling the `response_end` tool as your final action.',
  'If your turn would close without that call, the system rejects the end of the turn and asks you again, with no limit on how many times this happens.',
  'The call must belong to the closing of the reply: it releases only the step it was called from, so if the turn continues afterward (for example fresh user input arrives), you must call it again when the turn next comes to rest.',
  'When your reply is complete, call `response_end` (it takes no arguments) and add no further content after it.',
].join(' ')

function steerText(turn) {
  return '[response-end-gate] Did you intend to stop? In this session a reply may only end with a response_end tool call, so turn ' + turn + ' is still open. If you are finished, call response_end now as your last action; otherwise continue your work and close with response_end when you are done. An earlier response_end call does not count for a later stop.'
}

export function apply(ctx, config) {
  const lastStep = new Map()
  const releasedAt = new Map()

  const isGated = (agent) => {
    if (config.enabled.get() === false) return false
    if (agent === undefined) return false
    const header = agent.session !== undefined ? agent.session.header : undefined
    if (header === undefined) return true
    if (header.origin === 'subagent') return false
    return !(typeof header.delegationDepth === 'number' && header.delegationDepth > 0)
  }

  const buildTool = () => defineTool({
    name: TOOL_NAME,
    description: 'End the current conversation turn. This session rejects every other way of ending a reply: after your final answer, call response_end as your last action. It releases only the step it is called from; if the turn continues afterward you must call it again when the turn next comes to rest. Takes no arguments.',
    parameters: {},
    output: {
      schema: { type: 'object', properties: { ended: { type: 'boolean' } }, additionalProperties: false },
      render: () => [{ type: 'text', text: 'response_end accepted. This turn may now close from this step; if the turn continues, call response_end again when it next comes to rest.' }],
    },
    execute: (args, exec) => {
      if (isGated(exec.agent)) releasedAt.set(exec.agent.id, lastStep.get(exec.agent.id))
      exec.concludeTurn()
      return { ended: true }
    },
  })

  let disposeSection
  let disposeTool

  const refresh = () => {
    const enabled = config.enabled.get() !== false
    if (enabled && disposeSection === undefined) {
      disposeSection = ctx.systemPrompt.section({
        name: SECTION_NAME,
        order: SECTION_ORDER,
        text: (context) => (context !== undefined && isGated(context.agent) ? RULE_TEXT : ''),
      })
    } else if (!enabled && disposeSection !== undefined) {
      disposeSection()
      disposeSection = undefined
    }
    if (enabled && disposeTool === undefined) {
      disposeTool = ctx.tools.register(buildTool())
    } else if (!enabled && disposeTool !== undefined) {
      disposeTool()
      disposeTool = undefined
    }
  }

  refresh()
  ctx.on('loader/volatile-update', () => refresh())

  ctx.effect(() => () => {
    if (disposeSection !== undefined) disposeSection()
    if (disposeTool !== undefined) disposeTool()
  })

  ctx.on('agent/pre-step', (payload, next) => {
    if (payload.agent !== undefined) {
      lastStep.set(payload.agent.id, payload.step)
      if (payload.step === 1) releasedAt.delete(payload.agent.id)
    }
    return next()
  })

  ctx.on('agent/turn-stopping', (payload) => {
    const agent = payload.agent
    if (!isGated(agent)) return
    const step = lastStep.get(agent.id)
    if (step !== undefined && releasedAt.get(agent.id) === step) return
    try {
      agent.steer(createUserMessage({
        content: [{ type: 'text', text: steerText(payload.turn) }],
        source: { kind: 'plugin', plugin: name },
      }))
    } catch {}
  })

  ctx.on('agent/disposed', (payload) => {
    if (payload.agent !== undefined) {
      lastStep.delete(payload.agent.id)
      releasedAt.delete(payload.agent.id)
    }
  })
}
