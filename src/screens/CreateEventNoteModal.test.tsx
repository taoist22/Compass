import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import { CreateEventNoteModal } from './CreateEventNoteModal';

jest.mock('../supernote/exportService', () => ({
  listParaFolderEntries: jest.fn().mockResolvedValue([]),
  listStorageRoots: jest.fn().mockResolvedValue(['/storage/emulated/0']),
}));

function buttonWithText(renderer: TestRenderer.ReactTestRenderer, label: string) {
  return renderer.root.findAllByType(TouchableOpacity).find(button =>
    button.findAllByType(Text).some(text => text.props.children === label)
  );
}

describe('CreateEventNoteModal', () => {
  test('defaults to the PARA context but lets one note use the standard folder', () => {
    const onCreate = jest.fn();
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <CreateEventNoteModal
          visible
          eventKey="event-1"
          eventTitle="Project review"
          initialKind="meeting"
          initialName="2026-08-31 - Project review"
          preferContext
          meeting={{
            contextFolder: '/Note/Projects/Launch/Meetings',
            contextLabel: 'Project: Launch',
            defaultFolder: '/Note/Meetings',
            defaultLabel: 'Standard Meeting folder',
            templateLabel: 'Meeting Notes',
          }}
          classNote={{
            contextFolder: '/Note/Projects/Launch/Classes',
            contextLabel: 'Project: Launch',
            defaultFolder: '/Note/Classes',
            defaultLabel: 'Standard Class folder',
            templateLabel: 'College Ruled',
          }}
          onCancel={jest.fn()}
          onCreate={onCreate}
        />
      );
    });

    expect(renderer!.root.findAllByType(Text).some(text =>
      text.props.children === '/Note/Projects/Launch/Meetings'
    )).toBe(true);

    act(() => buttonWithText(renderer!, 'Standard Meeting folder')?.props.onPress());
    act(() => renderer!.root.findByType(TextInput).props.onChangeText('Decision Log'));
    act(() => buttonWithText(renderer!, 'Create Note')?.props.onPress());

    expect(onCreate).toHaveBeenCalledWith(
      'meeting',
      '/Note/Meetings',
      'Decision Log'
    );
  });
});
