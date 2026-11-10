import type { Dispatch, SetStateAction } from 'react'
import { useState } from 'react'

interface FormData {
  values: Record<string, string>
  errors: Record<string, string>
}

export const useSimpleForm = (
  initialValues = {}
): [
  FormData,
  Dispatch<SetStateAction<FormData>>,
  (name: string, value: string) => FormData,
  (name: string, value: string, error: string) => FormData,
] => {
  const [formData, setFormData] = useState<FormData>({
    values: initialValues,
    errors: {},
  })

  const setFormField = (name: string, value: string): FormData => {
    setFormData(({ values, errors: { [name]: _, ...errors } }) => ({
      values: { ...values, [name]: value },
      errors,
    }))
    return formData
  }

  // Set error
  const setFormError = (name: string, value: string, error: string): FormData => {
    setFormData(({ values, errors }) => ({
      values: { ...values, [name]: value },
      errors: { ...errors, [name]: error },
    }))
    return formData
  }

  return [formData, setFormData, setFormField, setFormError]
}
