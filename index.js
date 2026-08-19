import {AppRegistry, Image} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from './App';
import {name as appName} from './app.json';
import {PluginManager} from 'sn-plugin-lib';
import {LASSO_BUTTON_ID, TOOLBAR_BUTTON_ID} from './src/domain/buttonIds';

// ─── TEMPORARY BACKGROUND-EXECUTION PROBE ────────────────────────────────────
// Answers three questions that decide the reminder architecture:
//   1. Does PluginHost run a plugin's index.js at device boot, or only when a
//      NOTE/DOC is opened?  -> compare loadedAt against when you last rebooted.
//   2. Does a module-scope setInterval keep ticking with no panel open, and
//      through sleep?       -> tick count vs elapsed wall-clock time.
//   3. Is AsyncStorage shared across plugins?
//                           -> sn-lasso-diagnostic reads these same keys.
// Remove once answered. Deliberately in module scope: a component-level timer
// dies with the panel and would prove nothing.
const PROBE_LOADED_AT = '@sn-probe/calendar-loaded-at';
const PROBE_TICKS = '@sn-probe/calendar-ticks';
const PROBE_LAST_TICK = '@sn-probe/calendar-last-tick';
const PROBE_INTERVAL_MS = 60 * 1000;

AsyncStorage.setItem(PROBE_LOADED_AT, new Date().toISOString()).catch(() => {});
AsyncStorage.setItem(PROBE_TICKS, '0').catch(() => {});

setInterval(() => {
  AsyncStorage.getItem(PROBE_TICKS)
    .then(raw => {
      const next = String((parseInt(raw || '0', 10) || 0) + 1);
      return Promise.all([
        AsyncStorage.setItem(PROBE_TICKS, next),
        AsyncStorage.setItem(PROBE_LAST_TICK, new Date().toISOString()),
      ]);
    })
    .catch(() => {});
}, PROBE_INTERVAL_MS);
// ─── END PROBE ───────────────────────────────────────────────────────────────

const BUTTON_TYPE_TOOLBAR = 1;
const BUTTON_TYPE_LASSO = 2;
const SHOW_TYPE_WITH_UI = 1;

// Lasso data types that activate the button: 0=stroke, 1=title, 2=picture,
// 3=text, 4=link, 5=geometry. Omitting this matches nothing, which is why the
// button never appeared when it was registered without it.
const ALL_LASSO_DATA_TYPES = [0, 1, 2, 3, 4, 5];

AppRegistry.registerComponent(appName, () => App);

PluginManager.init();

// Both buttons register at startup, not from inside a React component — a
// component-scoped registration only exists while the plugin panel is open,
// so the lasso button would never be there when you actually need it.
PluginManager.registerButton(BUTTON_TYPE_TOOLBAR, ['NOTE'], {
  id: TOOLBAR_BUTTON_ID,
  name: 'Calendar',
  icon: Image.resolveAssetSource(require('./assets/icon.png')).uri,
  showType: SHOW_TYPE_WITH_UI,
});

PluginManager.registerButton(BUTTON_TYPE_LASSO, ['NOTE'], {
  id: LASSO_BUTTON_ID,
  name: 'Add to Calendar',
  icon: Image.resolveAssetSource(require('./assets/icon.png')).uri,
  editDataTypes: ALL_LASSO_DATA_TYPES,
  showType: SHOW_TYPE_WITH_UI,
});
