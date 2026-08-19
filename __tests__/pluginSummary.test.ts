import {getPluginSummary} from '../src/domain/pluginSummary';

describe('getPluginSummary', () => {
  it('returns the plugin description', () => {
    expect(getPluginSummary()).toBe('Calendar agenda view and meeting note snapshot creator.');
  });
});
