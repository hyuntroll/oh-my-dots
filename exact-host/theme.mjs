// Local host adapter for the shipped Electron theme functions. No palette is
// reimplemented here: colors come from original Nbt/Mbt/ExactApplyThemes.
// Source positions and version-specific aliases: docs/exact-ui/root-theme.md.
export function initOriginalTheme(initial, shared, settings = {}) {
  if (typeof initial.ExactApplyThemes !== 'function') throw Error('The asset server must expose original qos as ExactApplyThemes.');
  shared.Sut();
  initial.Nbt();
  const descriptors = shared.xut;
  const os = shared.cst();
  const root = document.documentElement;
  root.dataset.codexWindowType = 'electron';
  root.dataset.windowType = 'electron';
  root.dataset.codexOs = os;
  root.dataset.codexWindowChrome = shared.lst('electron', os);

  const sans = readSetting(descriptors.sansFontSize, settings.sansFontSize);
  const code = readSetting(descriptors.codeFontSize, settings.codeFontSize);
  // This is MHl's KHl map and scale formula, copied from the original function.
  const sizes = { '--text-4xl': 72, '--text-3xl': 48, '--text-2xl': 36, '--text-xl': 28, '--text-lg': 16, '--text-base': descriptors.sansFontSize.default, '--text-sm': descriptors.sansFontSize.default - 1, '--text-xs': descriptors.sansFontSize.default - 2, '--text-dynamic-isle-row': 14, '--text-heading-lg': 24, '--text-heading-app': 28, '--text-heading-md': 20, '--text-heading-sm': 18 };
  const scale = sans / descriptors.sansFontSize.default;
  const fontVariables = { '--font-code-size': `${code}px`, '--font-ui-size': `${sans}px`, '--font-code-family': null, '--font-ui-family': null, '--codex-content-font-family': null };
  for (const [name, size] of Object.entries(sizes)) fontVariables[name] = `${Math.round(size * scale)}px`;
  fontVariables['--cursor-interaction'] = readSetting(descriptors.usePointerCursors, settings.usePointerCursors) ? 'pointer' : null;
  fontVariables['-webkit-font-smoothing'] = os === 'darwin' && readSetting(descriptors.useFontSmoothing, settings.useFontSmoothing) ? 'antialiased' : null;
  for (const node of [root, document.body]) for (const [name, value] of Object.entries(fontVariables)) {
    if (value == null) node.style.removeProperty(name); else node.style.setProperty(name, value);
  }

  const media = matchMedia('(prefers-color-scheme: dark)');
  const preference = ['system', 'light', 'dark'].includes(settings.theme) ? settings.theme : descriptors.theme.default;
  const effectiveChatTheme = settings.effectiveChatTheme;
  const themes = { light: initial.Mbt(settings.lightChromeTheme, 'light', effectiveChatTheme), dark: initial.Mbt(settings.darkChromeTheme, 'dark', effectiveChatTheme) };
  let applied;
  const apply = () => {
    const variant = preference === 'system' ? media.matches ? 'dark' : 'light' : preference;
    applied = initial.ExactApplyThemes(document, themes, variant, effectiveChatTheme, settings.coloredUserMessages ?? true, false);
    return { variant, themes, variables: applied, os, chrome: root.dataset.codexWindowChrome, fontVariables };
  };
  const motionMedia = matchMedia('(prefers-reduced-motion: reduce)');
  const motionPreference = readSetting(descriptors.reducedMotionPreference, settings.reducedMotionPreference);
  // Original shared S8t resolves off/on/system; original root dGu writes String.
  const applyMotion = () => { root.dataset.reducedMotion = String(motionPreference === 'on' || motionPreference === 'system' && motionMedia.matches); };
  applyMotion();
  motionMedia.addEventListener('change', applyMotion);
  const result = apply();
  const change = () => { if (preference === 'system') apply(); };
  media.addEventListener('change', change);
  return { ...result, refresh: apply, dispose: () => { media.removeEventListener('change', change); motionMedia.removeEventListener('change', applyMotion); } };
}
function readSetting(descriptor, value) {
  if (value == null) return descriptor.default;
  const parsed = descriptor.schema?.safeParse(value);
  return parsed?.success ? parsed.data : descriptor.default;
}
