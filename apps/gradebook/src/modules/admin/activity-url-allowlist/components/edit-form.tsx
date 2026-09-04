'use client'

import { startTransition, useActionState, useEffect, useState } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, Checkbox, LoaderEllipsis, TextArea } from '@infonomic/uikit/react'
import { useForm } from 'react-hook-form'

import { LangLink } from '@/i18n/components/lang-link'
import { useTheme } from '@/ui/theme/provider'
import { getErrorText, hasErrors } from '@/utils/utils.forms'
import { allowlistRuleEditSchema } from '../@types'
import { editAllowlistRule } from '../edit'
import { GrandfatheringNotice } from './copy'
import { DeleteRuleForm } from './delete-form'
import { ImpactPreview } from './impact-preview'
import type { Locale } from '@/i18n/i18n-config'
import type { AllowlistRule, AllowlistRuleFormState } from '../@types'

export function AllowlistRuleEditForm({
  lng,
  rule,
}: {
  lng: Locale
  rule: AllowlistRule
}): React.JSX.Element {
  const { theme } = useTheme()
  const initialState: AllowlistRuleFormState = { message: undefined, errors: {}, status: 'idle' }
  const [formState, formAction, isPending] = useActionState(editAllowlistRule, initialState)
  const [enabled, setEnabled] = useState(rule.is_enabled)
  const resolver = zodResolver(allowlistRuleEditSchema)
  const {
    register,
    formState: { errors, isValid },
    handleSubmit,
    setError,
  } = useForm({ resolver, mode: 'onSubmit', defaultValues: { id: rule.id } })

  const handleOnSubmit = async (data: Record<string, any>): Promise<void> => {
    try {
      const formData = new FormData()
      formData.append('id', rule.id)
      formData.append('description', data.description ?? '')
      formData.append('is_enabled', enabled ? 'true' : 'false')

      startTransition(() => {
        formAction(formData)
      })
    } catch (error) {
      console.error('Error occurred in handleOnSubmit:', error)
    }
  }

  type ErrorKeys = keyof Pick<AllowlistRuleFormState['errors'], 'description'>

  useEffect(() => {
    if (formState?.errors != null && Object.keys(formState.errors).length > 0) {
      // `base_url` is not editable here, so only the description can carry a
      // server-side field error back into this form.
      const fields = Object.keys(formState.errors).filter(
        (field) => field === 'description'
      ) as ErrorKeys[]
      for (const field of fields) {
        const errorMessage = getErrorText(field, null, formState.errors)
        setError(field, { message: errorMessage })
      }
    }
  }, [formState?.errors, setError])

  // Disabling stops future admissions under this base URL, so the
  // grandfathering explanation belongs with the act, not in a help page.
  const disabling = rule.is_enabled && enabled === false

  return (
    <div className="max-w-[640px] mx-auto rounded-md border border-gray-100 dark:border-gray-700 p-5 pb-1 mb-8 mt-[4vh]">
      <h2 className="!m-0 !mb-1">Edit Allowlist Rule</h2>
      <p className="!mt-0 !mb-4 font-mono text-sm">{rule.base_url}</p>

      {formState?.status === 'failed' && (
        <Alert intent="danger">
          <span>{formState.message}</span>
        </Alert>
      )}

      <form
        action={formAction}
        onSubmit={handleSubmit(handleOnSubmit)}
        autoComplete="off"
        noValidate
      >
        <input type="hidden" {...register('id')} value={rule.id} />
        <TextArea
          id="description"
          rows={3}
          label="Description"
          defaultValue={rule.description ?? ''}
          helpText="Optional. Explain why this base URL is allowed, for whoever reads this next."
          error={!isValid && hasErrors('description', errors, null)}
          errorText={!isValid ? getErrorText('description', errors, null) : ''}
          {...register('description')}
        />

        <div className="my-4">
          <Checkbox
            id="is_enabled"
            name="is_enabled"
            label="Enabled"
            checked={enabled}
            onCheckedChange={(checked: boolean) => setEnabled(checked)}
          />
        </div>

        {disabling && (
          <>
            <GrandfatheringNotice />
            <ImpactPreview />
          </>
        )}

        <div className="form-actions flex gap-2 justify-end my-4">
          <Button
            className="min-w-[120px]"
            intent="noeffect"
            render={<LangLink href="/admin/activities" lng={lng} />}
          >
            Cancel
          </Button>
          <Button className="min-w-[120px]" disabled={isPending} type="submit">
            {isPending === true ? (
              <LoaderEllipsis color={theme === 'dark' ? '#000000' : '#FFFFFF'} size={42} />
            ) : (
              'Save'
            )}
          </Button>
        </div>
      </form>

      <DeleteRuleForm rule={rule} />
    </div>
  )
}
