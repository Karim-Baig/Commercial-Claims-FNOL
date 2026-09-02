import React from "react";
import { TextField, TextFieldProps } from "./TextField";

export interface DatePickerProps extends Omit<TextFieldProps, "type" | "multiline"> {}

/** Native date input. UUI supplies a themed calendar; the prop surface is the same. */
export function DatePicker(props: DatePickerProps) {
  return <TextField {...props} type="date" />;
}
