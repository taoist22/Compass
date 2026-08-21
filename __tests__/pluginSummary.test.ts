import {getPluginSummary} from '../src/domain/pluginSummary';

describe('getPluginSummary', () => {
  it('returns the plugin description', () => {
    expect(getPluginSummary()).toBe('Compass planning, PARA, calendar, task, and linked-note workspace.');
  });
});
