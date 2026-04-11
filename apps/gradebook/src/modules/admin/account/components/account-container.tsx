'use client'

import type React from 'react'
import { useState } from 'react'

import { Button, CloseIcon, Drawer, EditIcon, IconButton, Modal } from '@infonomic/uikit/react'
import cx from 'classnames'

import { formatDateTime } from '@/utils/utils.general'
import { ChangeEmailContainer } from './change-email/change-email-container'
import { ChangePassword } from './change-password'
import { CommunicationPreferences } from './communication-preferences'
import { DeleteAccount } from './delete-account'
import { PersonalInformation } from './personal-information'
import type { Locale } from '@/i18n/i18n-config'
import type { ActionProps, User, UserResponse } from '../@types'

type ComponentKey =
  | 'personal_information'
  | 'communication_preferences'
  | 'change_email'
  | 'change_password'
  | 'delete_account'
  | 'empty'

const components: Record<
  ComponentKey,
  { title: string; component: React.ComponentType<ActionProps>; drawerWidth?: string }
> = {
  personal_information: {
    title: 'Personal Information',
    component: PersonalInformation,
    drawerWidth: 'medium',
  },
  communication_preferences: {
    title: 'Communication Preferences',
    component: CommunicationPreferences,
    drawerWidth: 'medium',
  },
  change_email: {
    title: 'Change Email Address',
    component: ChangeEmailContainer,
    drawerWidth: 'medium',
  },
  change_password: {
    title: 'Change Password',
    component: ChangePassword,
    drawerWidth: 'medium',
  },

  delete_account: {
    title: 'Delete Account',
    component: DeleteAccount,
  },
  empty: {
    title: '',
    // eslint-disable-next-line react/jsx-no-useless-fragment
    component: () => {
      return <></>
    },
  },
}

function AccountPanel({
  title,
  onActionDrawerOpen,
  children,
}: {
  title: string
  onActionDrawerOpen?: () => void
  children: React.ReactNode
}) {
  return (
    <div className="border border-gray-100 rounded-md p-4 bg-canvas-25 dark:bg-canvas-800 dark:border-gray-700">
      <div className="flex justify-between items-center mb-2">
        <h2>{title}</h2>
        {onActionDrawerOpen && (
          <IconButton variant="text" onClick={onActionDrawerOpen}>
            <EditIcon width="20px" height="20px" />
          </IconButton>
        )}
      </div>
      <div>{children}</div>
    </div>
  )
}

export const AccountContainer = ({ user, lng }: { user: User; lng: Locale }) => {
  const [currentComponent, setCurrentComponent] = useState<ComponentKey>('empty')
  const [currentUser, setCurrentUser] = useState<User>(user)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleOnActionDrawerClose = () => {
    setCurrentComponent('empty')
    setIsDrawerOpen(false)
  }

  const handleOnModalClose = () => {
    setCurrentComponent('empty')
    setIsModalOpen(false)
  }

  const handleOnActionSuccess = (response: UserResponse | null | undefined) => {
    if (response?.user != null) {
      setCurrentUser(response.user)
    }
  }

  const handleOnActionDrawerOpen = (componentKey: ComponentKey) => () => {
    setCurrentComponent(componentKey as ComponentKey)
    setIsDrawerOpen(true)
  }

  const handleOnModalOpen = (componentKey: ComponentKey) => () => {
    setCurrentComponent(componentKey as ComponentKey)
    setIsModalOpen(true)
  }

  const whiteIcon = `
      .white-icon {
        fill: white;  
      }
  
      .dark .white-icon {
        fill: black;
      }
    `

  const Component: React.ComponentType<ActionProps> = components[currentComponent].component

  return (
    <>
      <style>{whiteIcon}</style>
      <div className="sm:grid sm:grid-cols-2 gap-4 mb-12">
        <div className="flex flex-col gap-4">
          <AccountPanel
            title="Personal Information"
            onActionDrawerOpen={handleOnActionDrawerOpen('personal_information')}
          >
            <p className="text-lg mb-3">
              Name: {`${currentUser.given_name} ${currentUser.family_name}`}
            </p>
            <Button
              className="mb-3"
              size="sm"
              onClick={handleOnActionDrawerOpen('personal_information')}
            >
              Change Name
            </Button>
            <div className="muted">
              <p>
                <span className="font-bold">Last sign in:</span>{' '}
                <span>{currentUser.last_login ? formatDateTime(currentUser.last_login) : '-'}</span>
              </p>
              <p>
                <span className="font-bold">Created:</span> {formatDateTime(currentUser.created_at)}
              </p>
              <p className="mb-2">
                <span className="font-bold">Updated:</span> {formatDateTime(currentUser.updated_at)}
              </p>
            </div>
          </AccountPanel>
          <AccountPanel title="Delete Account">
            <p className="mb-2">Delete Account</p>
            <Button size="sm" intent="danger" onClick={handleOnModalOpen('delete_account')}>
              Delete Account
            </Button>
          </AccountPanel>
        </div>
        <div className="flex flex-col gap-4">
          <AccountPanel
            title="Email Address"
            onActionDrawerOpen={handleOnActionDrawerOpen('change_email')}
          >
            <p className="mb-2">Email: {currentUser.email}</p>
            <Button size="sm" onClick={handleOnActionDrawerOpen('change_email')}>
              Change Email
            </Button>
          </AccountPanel>
          <AccountPanel
            title="Password"
            onActionDrawerOpen={handleOnActionDrawerOpen('change_password')}
          >
            <p className="mb-2">Change password.</p>
            <Button size="sm" onClick={handleOnActionDrawerOpen('change_password')}>
              Change Password
            </Button>
          </AccountPanel>
        </div>
      </div>
      <Drawer
        id="account-drawer"
        closeOnOverlayClick={false}
        width="medium"
        topOffset="60px"
        isOpen={isDrawerOpen}
        onDismiss={handleOnActionDrawerClose}
        className={cx(
          { 'md:w-[700px] lg:w-[800px]': components[currentComponent].drawerWidth === 'large' },
          { 'md:w-[500px]': components[currentComponent].drawerWidth === 'medium' },
          { 'md:w-[200px]': components[currentComponent].drawerWidth === 'narrow' }
        )}
      >
        <Drawer.Container aria-hidden={!isDrawerOpen}>
          <Drawer.TopActions>
            <button type="button" tabIndex={0} className="sr-only">
              no action
            </button>
            <IconButton arial-label="Close" size="xs" onClick={handleOnActionDrawerClose}>
              <CloseIcon width="14px" height="14px" svgClassName="white-icon" />
            </IconButton>
          </Drawer.TopActions>
          <Drawer.Header>
            <h2>{components[currentComponent].title}</h2>
          </Drawer.Header>
          <Drawer.Content>
            <Component
              user={currentUser}
              lng={lng}
              onSuccess={handleOnActionSuccess}
              onClose={handleOnActionDrawerClose}
            />
          </Drawer.Content>
        </Drawer.Container>
      </Drawer>
      <Modal isOpen={isModalOpen} onDismiss={handleOnModalClose} closeOnOverlayClick={false}>
        <Modal.Container className="sm:max-w-[550px] sm:mb-24">
          <Modal.Header className="flex items-center justify-between mb-4">
            <h3 className="m-0">{components[currentComponent].title}</h3>
            <IconButton
              arial-label="Close"
              size="xs"
              onClick={() => {
                setIsModalOpen(false)
              }}
            >
              <CloseIcon width="14px" height="14px" svgClassName="white-icon" />
            </IconButton>
          </Modal.Header>
          <Component
            user={currentUser}
            lng={lng}
            onSuccess={handleOnActionSuccess}
            onClose={handleOnModalClose}
          />
        </Modal.Container>
      </Modal>
    </>
  )
}
