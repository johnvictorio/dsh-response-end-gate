# dsh-response-end-gate

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) plugin that makes an explicit `response_end` tool call the only way for a conversation turn to end.

If the model finishes its reply without calling `response_end`, the plugin rejects the end of the turn and steers a mandatory instruction back to the model. This repeats for as long as needed: there is no retry limit, no counter, and no timeout.

## What it does

- Registers a model-visible `response_end` tool. Calling it marks the turn as closed and concludes the turn at that step.
- Registers a system-prompt section telling every top-level agent that replies may only end with `response_end`.
- Listens to `agent/pre-step`: tracks the current step per agent, and step 1 of a turn clears the release token, so each turn starts open.
- Listens to `agent/turn-stopping` (the loop's turn-close veto point): when a gated turn tries to close without a current-step release, it calls `agent.steer(...)` with a nudge message. Fresh steering makes the loop run another step instead of closing the turn.

Subagent children (sessions with `origin: 'subagent'` or `delegationDepth > 0`) are not gated: their turn-end is a report delivery to the parent, and the parent agent is still gated.

## Disabling it

Two ways, both live (no restart needed):

- **Session header button**: a `response_end on/off` capsule sits at the top right, beside the "Session log" button (slot `conversation.session.header.utilities`, order -1 so it lands just left of it). One click toggles the gate for the whole process; green dot = armed, grey = off. Settings writes are loopback-only: a remote browser sees the button but it reports it cannot write.
- **Settings file**: edit `~/.dsh/settings.yaml` and set the `response-end-gate` section to `enabled: false`. The file provider hot-reloads the change.

When disabled, the `response_end` tool disappears from every agent's tool list, the rule leaves the system prompt, and `agent/turn-stopping` stops steering. Re-enabling restores everything. The default is enabled.

For permanent removal, uninstall the bundle (`dsh plugin --profile web remove dsh-response-end-gate`, drop it from `bundles` in `~/.dsh/profiles/web/package.json`) and restart.

## Install

From the source directory:

```sh
npm pack
dsh plugin --profile web add file:/home/icly/dsh-response-end-gate/dsh-response-end-gate-1.0.0.tgz
```

Then add the bundle to the profile manifest in `~/.dsh/profiles/web/package.json`:

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-custom-prompt",
        "dsh-response-end-gate"
      ]
    }
  }
}
```

Restart the profile so the host composes the new row:

```sh
dsh web
```

The bundle carries its own `cordis.patch.yml`, which inserts the `response-end-gate` row once the bundle is listed.

## Behavior details

- The release is a **step token**, not a turn flag: `response_end` records the step it was called from and releases only that step's boundary. If the turn continues past it (for example fresh user input arrives while the tool result commits), the gate re-arms and the later close must call `response_end` again. Step 1 of every new turn clears the token.
- The steering message is a lossless-JSON `UserMessage` with source `{ kind: 'plugin', plugin: 'dsh-response-end-gate' }`; it is durable in the session log like any other steering input.
- The rule text enters the system prompt only for agents that are actually gated, so ungated subagents never see a promise the plugin will not enforce for them.
- If a user cancels a turn (stop button, interrupt), cancellation wins: steering from a canceled turn converges to the next turn instead of resurrecting the canceled one.

## Requirements

- The host plane must supply `systemPrompt` and `tools` (every standard deployment does).
- The plugin registers nothing that other rows depend on and publishes no services, so it needs no `isolate` realm.

## Layout

| File | Purpose |
| --- | --- |
| `index.js` | Host half: prompt section, gate listeners, `response_end` tool |
| `cordis.patch.yml` | Bundle patch that inserts the plugin row |
| `package.json` | Package manifest and `dsh.bundle.patch` declaration |

## License

MIT
