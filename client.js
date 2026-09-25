window.__ModuleLoader__.load({
  id: 'dsh-response-end-gate',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')

    const NAMESPACE = 'response-end-gate'

    const capsule = {
      border: '1px solid var(--dsw-alias-border-l2)',
      height: '32px',
      color: 'var(--dsw-alias-label-primary)',
      fontFamily: 'var(--dsw-font-family)',
      cursor: 'pointer',
      background: 'transparent',
      borderRadius: '18px',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '6px',
      padding: '6px 12px',
      fontSize: '13px',
      fontWeight: '400',
      lineHeight: '20px',
      display: 'inline-flex',
      whiteSpace: 'nowrap',
    }

    function GateToggle({ scope }) {
      const [snap, setSnap] = React.useState(scope.getSnapshot())
      const [pending, setPending] = React.useState(false)
      const [error, setError] = React.useState('')

      React.useEffect(() => scope.subscribe(() => {
        setSnap(scope.getSnapshot())
        setPending(false)
      }), [])

      const loading = snap.status === 'loading'
      const stored = snap.value && typeof snap.value === 'object' ? snap.value : null
      const enabled = stored === null ? true : stored.enabled !== false
      const writable = snap.writable === true

      const toggle = async () => {
        if (!writable || pending) return
        setPending(true)
        setError('')
        try {
          await scope.set('enabled', !enabled)
        } catch (err) {
          setError(String((err && err.message) || err))
        } finally {
          setPending(false)
          setSnap(scope.getSnapshot())
        }
      }

      const dot = enabled
        ? 'var(--dsw-alias-state-success-primary, #2ecc71)'
        : 'var(--dsw-alias-label-dimmed, #888)'

      return React.createElement('button', {
        type: 'button',
        style: Object.assign({}, capsule, { opacity: loading || !writable ? 0.6 : 1 }),
        disabled: loading || pending,
        'aria-pressed': enabled,
        title: error !== ''
          ? error
          : (writable ? 'Toggle the response_end turn-ending gate' : 'This browser cannot write settings.'),
        onClick: () => void toggle(),
      },
        React.createElement('span', {
          style: { width: '8px', height: '8px', borderRadius: '50%', background: dot, flex: 'none' },
        }),
        React.createElement('span', null, 'response_end'),
        React.createElement('span', { style: { color: 'var(--dsw-alias-label-secondary)' } }, enabled ? 'on' : 'off'),
      )
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      const settingsScope = ctx.get('settingsScope')
      if (!React || slots === undefined || settingsScope === undefined) return

      const scope = settingsScope.bind({ namespace: NAMESPACE })

      slots.inject('conversation.session.header.utilities', () => slots.register({
        name: 'conversation.session.header.utilities',
        id: 'response-end-gate',
        order: -1,
        label: 'response_end gate',
      }, () => React.createElement(GateToggle, { scope })))
    }

    exports.apply = apply
    exports.inject = ['slots', 'settingsScope']
    return module.exports
  },
})
