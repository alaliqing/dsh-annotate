/** Shared visual primitives; build.mjs embeds this in both isolated surfaces. */
function dsaTheme() {
  return {
    marker: '#f0a05a',
    markerInk: '#8b5529',
    focus: '#438bbf',
    toolbarHeight: 48,
    cardWidth: 294,
    sans: 'ui-sans-serif,system-ui,-apple-system,"Segoe UI","PingFang SC",sans-serif',
    mono: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
    light: { ink: '#252525', muted: '#747474', surface: '#ffffff', field: '#f5f5f5', line: '#e3e3e3', action: '#292929', onAction: '#ffffff' },
    dark: { ink: '#ededed', muted: '#a4a4a4', surface: '#242424', field: '#303030', line: '#444444', action: '#ededed', onAction: '#242424' },
  }
}
