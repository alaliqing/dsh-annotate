const React = require('react')
const { createRoot } = require('react-dom/client')
const slots = new Map()
let input = { draft: '' }
const subscribers = new Set()
let workspaces = []
let workspaceSnapshot = { items: workspaces }
const workspaceSubscribers = new Set()
window.reviewTest = { fail: false, delay: 0, calls: [], sid: 'review-a' }
const actions = { setDraft(value) { input = { draft: value }; subscribers.forEach(fn => fn()) } }
const useInput = (selector) => React.useSyncExternalStore(fn => { subscribers.add(fn); return () => subscribers.delete(fn) }, () => selector(input))
// The panel discovers its workspace from this snapshot, so a test can point it
// at a directory of its own. The snapshot object stays cached: useSyncExternalStore
// needs a stable reference between updates, and only the items array changes.
const useWorkspaces = (selector) => React.useSyncExternalStore(fn => { workspaceSubscribers.add(fn); return () => workspaceSubscribers.delete(fn) }, () => selector(workspaceSnapshot))
const ctx = {
  effect: fn => fn(),
  get(name) {
    return {
      slots: { inject: (key, fn) => fn(), register: (options, component) => { slots.set(options.id, component) } },
      sidebarRightTabs: { register() {} }, sidebarRight: { openTab() {} },
      sessions: {
        scope: sid => ({ sid }),
        sessionOf: scope => ({
          beginSubmission: () => ({ requestId: crypto.randomUUID(), abandon() {} }),
          async prompt(content, mode, signal, requestId) {
            window.reviewTest.calls.push({ sid: scope.sid, content, mode, requestId })
            await new Promise(r => setTimeout(r, window.reviewTest.delay))
            return window.reviewTest.fail ? { ok: false, error: { message: 'test refusal' } } : { ok: true, value: { accepted: true } }
          }
        })
      }
    }[name]
  }
}
const root = createRoot(document.querySelector('#root'))
function render() {
  const Component = slots.get('dsh-annotate')
  const props = { sessionId: window.reviewTest.sid, useInput, inputActions: actions, useWorkspaces }
  root.render(React.createElement(Component, { ...props, key: window.reviewTest.sid }))
}
window.__ModuleLoader__ = { load(bundle) { const plugin = bundle.factory(() => React); plugin.apply(ctx); render() } }
window.reviewTest.switchSession = sid => { window.reviewTest.sid = sid; render() }
window.reviewTest.setWorkspaces = items => { workspaces = Array.isArray(items) ? items : []; workspaceSnapshot = { items: workspaces }; workspaceSubscribers.forEach(fn => fn()) }
window.reviewTest.setDraft = actions.setDraft
window.reviewTest.getDraft = () => input.draft
