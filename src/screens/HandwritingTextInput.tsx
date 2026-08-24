import React from 'react';
import {
  NativeSyntheticEvent,
  TextInput,
  TextInputEndEditingEventData,
  TextInputProps,
} from 'react-native';

export interface HandwritingTextInputHandle {
  getValue: () => string;
  focus: () => void;
  setValue: (value: string) => void;
}

interface HandwritingTextInputProps
  extends Omit<TextInputProps, 'defaultValue' | 'onChangeText' | 'value'> {
  /** Value used when a form is opened or reset programmatically. */
  value: string;
  /** Called only when native composition ends, not for every partial stroke. */
  onChangeText?: (value: string) => void;
  /** Lightweight escape hatch for Save buttons that need the live draft. */
  onDraftChange?: (value: string) => void;
}

/**
 * A TextInput that leaves an in-progress handwriting composition in Android.
 *
 * A controlled React Native input reflects every partial IME update through
 * JS and back into the native view. On Supernote that can interrupt the ink
 * drawing itself. This component keeps the live draft native, exposes it to
 * Save handlers through a ref, and updates React state only at the end of the
 * editing session.
 */
export const HandwritingTextInput = React.forwardRef<
  HandwritingTextInputHandle,
  HandwritingTextInputProps
>(function HandwritingTextInput(
  { value, onChangeText, onDraftChange, onEndEditing, onBlur, ...props },
  forwardedRef
) {
  const nativeRef = React.useRef<TextInput>(null);
  const draftRef = React.useRef(value);
  const lastExternalValue = React.useRef(value);
  const lastCommittedValue = React.useRef(value);

  React.useImperativeHandle(
    forwardedRef,
    () => ({
      getValue: () => draftRef.current,
      focus: () => nativeRef.current?.focus(),
      setValue: next => {
        draftRef.current = next;
        lastExternalValue.current = next;
        lastCommittedValue.current = next;
        nativeRef.current?.setNativeProps({ text: next });
        onDraftChange?.(next);
      },
    }),
    [onDraftChange]
  );

  React.useEffect(() => {
    if (value === lastExternalValue.current) return;
    lastExternalValue.current = value;
    draftRef.current = value;
    lastCommittedValue.current = value;
    nativeRef.current?.setNativeProps({ text: value });
    onDraftChange?.(value);
  }, [value, onDraftChange]);

  const commit = () => {
    if (draftRef.current === lastCommittedValue.current) return;
    lastCommittedValue.current = draftRef.current;
    onChangeText?.(draftRef.current);
  };

  return (
    <TextInput
      {...props}
      ref={nativeRef}
      defaultValue={value}
      onChangeText={next => {
        draftRef.current = next;
        onDraftChange?.(next);
      }}
      onBlur={event => {
        commit();
        onBlur?.(event);
      }}
      onEndEditing={(event: NativeSyntheticEvent<TextInputEndEditingEventData>) => {
        draftRef.current = event.nativeEvent.text;
        onDraftChange?.(event.nativeEvent.text);
        commit();
        onEndEditing?.(event);
      }}
    />
  );
});
