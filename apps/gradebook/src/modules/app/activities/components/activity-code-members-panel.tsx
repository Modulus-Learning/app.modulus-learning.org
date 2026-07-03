'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import {
  Autocomplete,
  AutocompleteItem,
  Button,
  CloseIcon,
  IconButton,
  Modal,
} from '@infonomic/uikit/react'

import useDebounce from '@/hooks/use-debounce'
import { addActivityCodeMember } from '../add-activity-code-member'
import { listActivityCodeMembers } from '../list-activity-code-members'
import { removeActivityCodeMember } from '../remove-activity-code-member'
import { searchInstructors } from '../search-instructors'
import type { ActivityCodeMember, InstructorSearchResult } from '../@types'

type ActivityCodeMembersPanelProps = {
  activityCodeId: string
  initialMembers: ActivityCodeMember[]
  currentUserId: string
}

export function ActivityCodeMembersPanel({
  activityCodeId,
  initialMembers,
  currentUserId,
}: ActivityCodeMembersPanelProps) {
  const router = useRouter()
  const [members, setMembers] = useState<ActivityCodeMember[]>(initialMembers)
  const [inputValue, setInputValue] = useState<string>('')
  const [items, setItems] = useState<InstructorSearchResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [pendingRemoval, setPendingRemoval] = useState<ActivityCodeMember | null>(null)

  const debouncedQuery = useDebounce(inputValue, 250)

  useEffect(() => {
    const query = (debouncedQuery ?? '').trim()
    // Only search once the user has typed something — avoids dumping the
    // entire instructor directory on every focus.
    if (query.length === 0) {
      setItems([])
      return
    }
    let cancelled = false
    searchInstructors(activityCodeId, query).then(({ results }) => {
      if (!cancelled) setItems(results)
    })
    return () => {
      cancelled = true
    }
  }, [debouncedQuery, activityCodeId])

  const handleSelectInstructor = (instructor: InstructorSearchResult) => {
    setError(null)
    startTransition(async () => {
      const result = await addActivityCodeMember(activityCodeId, instructor.user_id)
      if (result.error != null) {
        setError(result.error)
        return
      }
      setMembers(result.members)
      setInputValue('')
      setItems([])
    })
  }

  const requestRemoveMember = (member: ActivityCodeMember) => {
    setError(null)
    setPendingRemoval(member)
  }

  const cancelRemoveMember = () => {
    setPendingRemoval(null)
  }

  const confirmRemoveMember = () => {
    const member = pendingRemoval
    if (member == null) return
    const isSelf = member.user_id === currentUserId
    startTransition(async () => {
      const result = await removeActivityCodeMember(activityCodeId, member.user_id)
      if (result.error != null) {
        setError(result.error)
        // Best-effort refresh in case the list is now out of sync.
        const { members: latest } = await listActivityCodeMembers(activityCodeId)
        setMembers(latest)
        setPendingRemoval(null)
        return
      }
      setPendingRemoval(null)
      if (isSelf) {
        // The user removed themselves — they no longer have access to this code.
        router.replace('/dashboard')
        return
      }
      setMembers(result.members)
    })
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="max-w-[400px]">
        <Autocomplete<InstructorSearchResult>
          id={`add-member-${activityCodeId}`}
          // label="Optionally add other instructors to this activity code."
          placeholder="Search by name or email"
          helpText="Optionally add other instructors to this activity code."
          mode="none"
          items={items}
          value={inputValue}
          onValueChange={(value: string) => {
            setInputValue(value)
          }}
          emptyText={
            (debouncedQuery ?? '').trim().length === 0
              ? 'Start typing to search instructors.'
              : 'No matching instructors.'
          }
        >
          {(instructor: InstructorSearchResult) => (
            <AutocompleteItem
              key={instructor.user_id}
              value={instructor}
              onClick={() => handleSelectInstructor(instructor)}
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium">{instructor.full_name ?? '(no name)'}</span>
                <span className="text-xs text-gray-500">{instructor.email ?? '(no email)'}</span>
              </div>
            </AutocompleteItem>
          )}
        </Autocomplete>
        {error != null && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
      <div>
        <h3 className="text-[1.1rem] font-semibold mb-2">Members</h3>
        {members.length === 0 ? (
          <p className="text-sm text-gray-500">No members yet.</p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded">
            {members.map((member) => (
              <li
                key={member.user_id}
                className="flex items-center justify-between px-3 py-2 gap-3"
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium truncate">
                    {member.full_name ?? '(no name)'}
                  </span>
                  <span className="text-xs text-gray-500 truncate">
                    {member.email ?? '(no email)'}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="text"
                  intent="danger"
                  onClick={() => requestRemoveMember(member)}
                  disabled={isPending}
                >
                  {member.user_id === currentUserId ? 'Leave' : 'Remove'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <RemoveMemberConfirmModal
        member={pendingRemoval}
        isSelf={pendingRemoval?.user_id === currentUserId}
        isPending={isPending}
        onCancel={cancelRemoveMember}
        onConfirm={confirmRemoveMember}
      />
    </div>
  )
}

type RemoveMemberConfirmModalProps = {
  member: ActivityCodeMember | null
  isSelf: boolean
  isPending: boolean
  onCancel: () => void
  onConfirm: () => void
}

function RemoveMemberConfirmModal({
  member,
  isSelf,
  isPending,
  onCancel,
  onConfirm,
}: RemoveMemberConfirmModalProps) {
  const isOpen = member != null
  const memberLabel = member?.full_name ?? member?.email ?? 'this member'

  return (
    <Modal isOpen={isOpen} onDismiss={onCancel} closeOnOverlayClick={false}>
      <Modal.Container className="sm:max-w-[480px]">
        <Modal.Header className="flex items-center justify-between mb-4">
          <h3 className="m-0">{isSelf ? 'Leave this activity code?' : 'Remove member?'}</h3>
          <IconButton aria-label="Close" size="xs" onClick={onCancel}>
            <CloseIcon width="14px" height="14px" svgClassName="white-icon" />
          </IconButton>
        </Modal.Header>
        <Modal.Content>
          {isSelf ? (
            <p>
              You are about to remove <strong>yourself</strong> from this activity code. You will
              lose access to it immediately and will need to be re-added by another member to regain
              access. Are you sure you want to leave?
            </p>
          ) : (
            <p>
              You are about to remove <strong>{memberLabel}</strong> from this activity code. They
              will lose access immediately. Are you sure?
            </p>
          )}
        </Modal.Content>
        <Modal.Actions>
          <Button size="md" intent="noeffect" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button size="md" intent="danger" onClick={onConfirm} disabled={isPending}>
            {isSelf ? 'Leave' : 'Remove'}
          </Button>
        </Modal.Actions>
      </Modal.Container>
    </Modal>
  )
}
