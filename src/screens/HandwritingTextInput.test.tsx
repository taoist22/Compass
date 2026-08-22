import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { HandwritingTextInput, HandwritingTextInputHandle } from './HandwritingTextInput';

describe('HandwritingTextInput', () => {
  test('keeps partial native drafts out of React state until editing ends', () => {
    const committed = jest.fn();
    const ref = React.createRef<HandwritingTextInputHandle>();
    let renderer: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        <HandwritingTextInput ref={ref} value="" onChangeText={committed} />
      );
    });

    const nativeInput = renderer!.root.findByType(TextInput);
    act(() => nativeInput.props.onChangeText('handwritten draft'));

    expect(committed).not.toHaveBeenCalled();
    expect(ref.current?.getValue()).toBe('handwritten draft');

    act(() => nativeInput.props.onEndEditing({ nativeEvent: { text: 'handwritten draft' } }));
    expect(committed).toHaveBeenCalledWith('handwritten draft');
    act(() => nativeInput.props.onBlur({ nativeEvent: {} }));
    expect(committed).toHaveBeenCalledTimes(1);
  });
});
