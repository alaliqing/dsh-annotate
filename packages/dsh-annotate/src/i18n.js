/**
 * dsh-annotate — UI message catalog.
 *
 * Deliberately not an ES module: build.mjs prepends this file to the client
 * bundle and wraps it around the injected overlay, and neither is loaded through
 * a module system. Both call `dsaI18n(...)` and get back `{ t, lang, set,
 * toggle, detect }`.
 *
 * Two rules when adding a string:
 *   1. Add the key to BOTH languages below.
 *   2. Call `t('key')` at the use site — never inline a literal.
 * `t` falls back to English and then to the key itself, so a missing
 * translation shows up as a visible key rather than an empty element.
 *
 * Placeholders are `{name}` and are substituted by `t(key, { name: value })`.
 */
function dsaI18n(preferred) {
  var CATALOG = {
    en: {
      // ---- annotation block sent to the model ------------------------------
      'payload.head': '🎯 UI annotations · {page} · viewport {w}×{h} ({count})',
      'payload.selector': '   selector: ',
      'payload.selectorMatches': ' ({count} matches)',
      'payload.semantics': '   semantics: ',
      'payload.component': '   component: ',
      'payload.componentChain': '   component chain: ',
      'payload.geometry': '   position/size: ',
      'payload.viewportZone': ' · viewport {zone} ({x}%W × {y}%H)',
      'payload.styles': '   computed styles: ',
      'payload.text': '   text: ',
      'payload.comment': '   note: ',
      'payload.attached': '{count} attached',
      'payload.removeOne': 'Remove this block from the composer',
      'payload.removeAll': 'Remove all',
      'zone.topLeft': 'top left',
      'zone.topCenter': 'top center',
      'zone.topRight': 'top right',
      'zone.middleLeft': 'middle left',
      'zone.middleCenter': 'center',
      'zone.middleRight': 'middle right',
      'zone.bottomLeft': 'bottom left',
      'zone.bottomCenter': 'bottom center',
      'zone.bottomRight': 'bottom right',

      // ---- injected overlay ------------------------------------------------
      'overlay.saveFailed': 'Annotations cannot be saved in this browser. Attach them to the composer before you navigate away.',
      'overlay.editPin': 'Edit annotation {n}: {comment}',
      'overlay.close': 'Close',
      'overlay.placeholder': 'What should change here? (Shift+Enter for a new line)',
      'overlay.hint': 'Enter to save · Esc to cancel',
      'overlay.save': 'Save',

      // ---- panel: entry points --------------------------------------------
      'panel.headerTitle': 'UI annotations (⌘⇧B): list the local services that are running, open one and annotate it',
      'panel.headerLabel': 'Annotate',
      'panel.headerLabelCount': 'Annotate {count}',
      'panel.tabTitle': 'UI annotations',
      'panel.tabDescription': 'Detect the local web servers that are running, open one, pick elements and send the notes to DeepSeek in one go',
      'panel.noSession': 'Choose a workspace and open a conversation first, then use UI annotations.',
      'panel.language': 'Language',
      'panel.languageSwitch': 'Switch to {lang}',

      // ---- panel: list face -----------------------------------------------
      'list.detecting': 'Scanning for local services…',
      'list.detected': '{count} local services found',
      'list.none': 'No local services found',
      'list.redetect': 'Scan again',
      'list.open': 'Open →',
      'list.emptyHint': 'No local web server is running ({count} ports scanned). Start one, then refresh:',
      'list.copy': 'Copy',
      'list.copied': 'Copied: {text}',
      'list.autoRefresh': 'Checked every 5 seconds. You can also type a port below to open it directly.',
      'list.placeholder': '5173 or localhost:3000',
      'list.addressLabel': 'Local service address',
      'list.openButton': 'Open',
      'list.helpHeader': 'Annotate inside the preview',
      'list.helpPicking': 'Press Mark below, then click an element in the page and write a note. Enter saves it.',
      'list.helpEscape': 'Esc leaves annotation mode. Changing page or scrolling is unaffected — press Mark again whenever you want.',
      'list.helpCmdClick': '⌘/Ctrl+click an element = save it and send immediately.',
      'list.helpSendHeader': 'The list and sending',
      'list.helpSendList': 'The annotations button in the toolbar opens an in-flow list for locating and deleting comments. It never covers the preview.',
      'list.helpSendActions': '“Send annotations” sends only the annotations; “Add to composer” combines them with your draft so you can add context. Annotations survive a failed send.',

      // ---- panel: page face -----------------------------------------------
      'page.back': 'Back',
      'page.forward': 'Forward',
      'page.reload': 'Reload',
      'page.addressPlaceholder': 'Address',
      'page.widthLabel': 'Preview width',
      'page.widthFit': 'Fit',
      'page.widthMobile': 'Mobile',
      'page.listToggleLabel': 'Annotation list, {count}',
      'page.listToggleEmpty': 'Annotation list, empty',
      'page.listExpand': 'Expand the annotation list',
      'page.listCollapse': 'Collapse the annotation list',
      'page.listEmpty': 'No annotations',
      'page.listAria': 'Annotation list',
      'page.backToList': 'Back to the local service list',
      'page.help': 'How this works',
      'page.locate': 'Locate in the preview',
      'page.delete': 'Delete this annotation',
      'page.previewTitle': 'Preview',
      'page.loading': 'Opening the preview…',
      'page.loadingHint': 'Connecting to the local service. Annotations are restored automatically.',
      'page.unavailable': 'Preview unavailable',
      'page.retry': 'Retry',
      'page.markTitle': 'Mark mode: click an element to write a note (Esc to leave)',
      'page.mark': 'Mark',
      'page.marking': 'Marking',
      'page.openExternal': 'Open in the system browser',
      'page.unit': '{count}',
      'page.attach': 'Add to composer',
      'page.send': 'Send annotations',
      'page.sending': 'Sending…',
      'page.sendHint': 'Send only these annotations and keep the composer draft',
      'notice.undo': 'Undo',
      'notice.dismiss': 'Dismiss',
      'notice.deleted': 'Annotation deleted. You can undo this.',
      'notice.badAddress': 'That does not look like an address. Try localhost:5173 or just 5173.',
      'notice.notLocal': 'Open a local development service; external sites and Harness itself are not supported.',
      'notice.previewFailed': 'Could not open the preview',
      'notice.detectFailed': 'Scan failed: {error}',
      'notice.unknownError': 'unknown error',
      'notice.autoOpened': 'One local service found, opened it automatically',
      'notice.storageUnavailable': 'Browser storage is unavailable. Add the annotations to the composer before closing.',
      'notice.finishEditing': 'Save or close the annotation you are editing first.',
      'notice.noComposer': 'Select a conversation with a composer first.',
      'notice.attachFailed': 'Could not add to the composer. The annotations are kept.',
      'notice.attached': 'Added to the composer. Add context and send when ready.',
      'notice.sendUnsupported': 'This Harness build cannot send directly; use “Add to composer”.',
      'notice.notAccepted': 'The conversation did not accept this message',
      'notice.accepted': 'Conversation accepted {count} annotations',
      'notice.sendFailed': 'Send failed, annotations kept: {error}',
      'notice.pluginUnavailable': 'The plugin service is unavailable. Confirm that Harness restarted and loaded the plugin.',
      'notice.loadTimeout': 'The page took too long to load. Check the development service and retry.',
      'notice.draftUnavailable': 'The draft cannot be persisted. Save the annotation first.',
      'notice.elementGone': 'The original element changed or disappeared. The annotation is kept — delete it and annotate again.',
      'host.notLocalTarget': 'Only local development services can be previewed; Harness itself cannot.',
      'host.tooManyPreviews': 'Too many previews are open. Restart the plugin to release the idle ones.',
      'host.noCommand': 'No start command is configured (this is an optional feature).',
      'host.noRoot': 'The workspace directory is unknown, so no dev server can be started.',
      'host.starting': 'A service for this workspace is already starting. Please wait.',
      'host.portBusy': 'That port is already in use and cannot be confirmed as yours. Open it from the local service list, or change the port.',
      'host.startFailed': 'Failed to start: {error}',
      'host.exited': 'The dev server exited ({code})',
      'host.readyTimeout': 'Timed out waiting for the dev server to become ready ({seconds}s)',
      'host.originNotAllowed': 'origin not allowed',
      'host.methodNotAllowed': 'method not allowed',
      'host.upstreamUnreachable': 'The local service is unreachable. Check the service or its HTTPS certificate.',
      'host.previewConnectFailed': 'Preview connection failed',
      'host.connectTimeout': 'Connection timed out',
    },

    zh: {
      // ---- annotation block sent to the model ------------------------------
      'payload.head': '🎯 界面标注 · {page} · 视口 {w}×{h}（{count} 条）',
      'payload.selector': '   选择器: ',
      'payload.selectorMatches': '（命中 {count} 个元素）',
      'payload.semantics': '   语义: ',
      'payload.component': '  组件:',
      'payload.componentChain': '   组件链: ',
      'payload.geometry': '   位置/尺寸: ',
      'payload.viewportZone': ' · 视口 {zone}（{x}%W × {y}%H）',
      'payload.styles': '   当前样式: ',
      'payload.text': '   文本: ',
      'payload.comment': '   批注: ',
      'payload.attached': '已附 {count} 条标注',
      'payload.removeOne': '从输入框移除这段标注',
      'payload.removeAll': '全部移除',
      'zone.topLeft': '左上',
      'zone.topCenter': '上中',
      'zone.topRight': '右上',
      'zone.middleLeft': '左中',
      'zone.middleCenter': '正中',
      'zone.middleRight': '右中',
      'zone.bottomLeft': '左下',
      'zone.bottomCenter': '下中',
      'zone.bottomRight': '右下',

      // ---- injected overlay ------------------------------------------------
      'overlay.saveFailed': '批注无法保存到浏览器，请在离开页面前加入输入框。',
      'overlay.editPin': '编辑批注 {n}：{comment}',
      'overlay.close': '关闭',
      'overlay.placeholder': '写一句要改什么…（Shift+Enter 换行）',
      'overlay.hint': 'Enter 保存 · Esc 取消',
      'overlay.save': '保存',

      // ---- panel: entry points --------------------------------------------
      'panel.headerTitle': '界面标注（⌘⇧B）：列出本地在跑的服务，点开就能标注',
      'panel.headerLabel': '标注',
      'panel.headerLabelCount': '标注 {count}',
      'panel.tabTitle': '界面标注',
      'panel.tabDescription': '检测本地在跑的 web，点开即可圈选元素写批注，一次发给 DeepSeek',
      'panel.noSession': '先选择工作区并打开会话，再使用界面标注。',
      'panel.language': '语言',
      'panel.languageSwitch': '切换到{lang}',

      // ---- panel: list face -----------------------------------------------
      'list.detecting': '正在检测本地服务…',
      'list.detected': '检测到 {count} 个本地服务',
      'list.none': '没有检测到本地服务',
      'list.redetect': '重新检测',
      'list.open': '打开 →',
      'list.emptyHint': '没有正在运行的本地 web（已扫 {count} 个端口）。先把它跑起来，再点刷新：',
      'list.copy': '复制',
      'list.copied': '已复制：{text}',
      'list.autoRefresh': '每 5 秒自动检查一次。也可在下方输入端口直接打开。',
      'list.placeholder': '5173 或 localhost:3000',
      'list.addressLabel': '本地服务地址',
      'list.openButton': '打开',
      'list.helpHeader': '在预览里标注',
      'list.helpPicking': '点下面「标记」，然后点页面里的元素写批注，Enter 保存。',
      'list.helpEscape': 'Esc 退出标注状态（换页面、滚动都不受影响，随时再点「标记」继续）。',
      'list.helpCmdClick': '⌘/Ctrl+点击元素 = 写完立即发送。',
      'list.helpSendHeader': '批注列表与发送',
      'list.helpSendList': '顶部工具栏的「批注」按钮可展开列表，逐条定位或删除，不遮挡预览页面。',
      'list.helpSendActions': '「发送批注」只发送当前批注；「加入输入框」可与草稿一起补充后发送。失败时批注会保留。',

      // ---- panel: page face -----------------------------------------------
      'page.back': '后退',
      'page.forward': '前进',
      'page.reload': '重新载入',
      'page.addressPlaceholder': '地址',
      'page.widthLabel': '预览宽度',
      'page.widthFit': '自适应',
      'page.widthMobile': '移动端',
      'page.listToggleLabel': '批注列表，{count} 条',
      'page.listToggleEmpty': '批注列表，暂无批注',
      'page.listExpand': '展开批注列表',
      'page.listCollapse': '收起批注列表',
      'page.listEmpty': '暂无批注',
      'page.listAria': '批注列表',
      'page.backToList': '回到本地服务列表',
      'page.help': '怎么用',
      'page.locate': '在预览里定位',
      'page.delete': '删除这条标注',
      'page.previewTitle': '预览',
      'page.loading': '正在打开预览…',
      'page.loadingHint': '正在连接本地服务，批注会自动恢复。',
      'page.unavailable': '预览暂时不可用',
      'page.retry': '重试',
      'page.markTitle': '标记模式：点击元素写批注（Esc 退出）',
      'page.mark': '标注',
      'page.marking': '标注中',
      'page.openExternal': '在系统浏览器打开',
      'page.unit': '{count} 条',
      'page.attach': '加入输入框',
      'page.send': '发送批注',
      'page.sending': '发送中…',
      'page.sendHint': '只发送这些批注，保留输入框中的草稿',
      'notice.undo': '撤销',
      'notice.dismiss': '知道了',
      'notice.deleted': '已删除批注，可撤销。',
      'notice.badAddress': '这个地址看不出来是什么，试试 localhost:5173 或直接输 5173',
      'notice.notLocal': '请打开本地开发服务；不支持外部网站或 Harness 自身。',
      'notice.previewFailed': '无法打开预览',
      'notice.detectFailed': '检测失败：{error}',
      'notice.unknownError': '未知错误',
      'notice.autoOpened': '检测到 1 个本地服务，已自动打开',
      'notice.storageUnavailable': '浏览器存储不可用，请在关闭前加入输入框。',
      'notice.finishEditing': '请先保存或关闭正在编辑的批注。',
      'notice.noComposer': '请先选择一个有输入框的会话。',
      'notice.attachFailed': '未能加入输入框，批注已保留。',
      'notice.attached': '已加入输入框，可补充说明后发送。',
      'notice.sendUnsupported': '当前 Harness 不支持直接发送，请使用「加入输入框」。',
      'notice.notAccepted': '会话未接受这条消息',
      'notice.accepted': '会话已接收 {count} 条批注',
      'notice.sendFailed': '发送失败，批注已保留：{error}',
      'notice.pluginUnavailable': '插件服务不可用，请确认 Harness 已重启并加载插件。',
      'notice.loadTimeout': '页面加载超时。请检查开发服务后重试。',
      'notice.draftUnavailable': '草稿无法持久保存，请先保存批注。',
      'notice.elementGone': '原元素已变化或消失，批注仍保留，可删除后重新标注。',
      'host.notLocalTarget': '仅支持本地开发服务，不可预览 Harness 自身。',
      'host.tooManyPreviews': '预览数量已达上限，请重启插件释放闲置预览。',
      'host.noCommand': '未配置启动命令（可选功能）',
      'host.noRoot': '不知道工作区目录，无法启动 dev server',
      'host.starting': '当前工作区的服务正在启动，请稍候。',
      'host.portBusy': '该端口已被占用，无法确认属于当前工作区。请从本地服务列表打开，或更换端口。',
      'host.startFailed': '启动失败: {error}',
      'host.exited': 'dev server 退出（{code}）',
      'host.readyTimeout': '等待 dev server 就绪超时（{seconds}s）',
      'host.originNotAllowed': '来源不被允许',
      'host.methodNotAllowed': '请求方法不被允许',
      'host.upstreamUnreachable': '本地服务无法连接，请检查服务或 HTTPS 证书。',
      'host.previewConnectFailed': '预览连接失败',
      'host.connectTimeout': '连接超时',
    },
  }

  var LABELS = { en: 'EN', zh: '中' }

  /** `zh-Hans-CN` and `zh` both mean Chinese; anything else falls through. */
  function normalize(value) {
    var text = String(value || '').toLowerCase()
    if (text.indexOf('zh') === 0) return 'zh'
    if (text.indexOf('en') === 0) return 'en'
    return ''
  }

  function detect() {
    if (typeof navigator === 'undefined') return 'en'
    var tags = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]
    for (var i = 0; i < tags.length; i += 1) {
      var match = normalize(tags[i])
      if (match) return match
    }
    return 'en'
  }

  function format(template, vars) {
    return String(template).replace(/\{(\w+)\}/g, function (match, key) {
      return vars && Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match
    })
  }

  var lang = normalize(preferred) || detect()

  return {
    get lang() {
      return lang
    },
    label: function () {
      return LABELS[lang] || lang
    },
    /** Name of the language `toggle()` would switch to, for the button title. */
    nextLabel: function () {
      return LABELS[lang === 'en' ? 'zh' : 'en']
    },
    set: function (next) {
      var match = normalize(next)
      if (match) lang = match
      return lang
    },
    toggle: function () {
      lang = lang === 'zh' ? 'en' : 'zh'
      return lang
    },
    detect: detect,
    /** The raw table for one language. `scripts/check.mjs` uses this to assert
     *  that both languages define exactly the same keys. */
    catalog: function (which) {
      return CATALOG[which] || CATALOG.en
    },
    t: function (key, vars) {
      var table = CATALOG[lang] || CATALOG.en
      var value = table[key] === undefined ? CATALOG.en[key] : table[key]
      if (value === undefined) return key
      return vars ? format(value, vars) : value
    },
  }
}
