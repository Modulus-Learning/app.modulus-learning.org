// LTI roles that should indicate the user is an instructor for our purposes.
// The LTI spec defines a number of roles without specifying their meaning, so
// for now this list just includes roles that Canvas appears to use.  See:
// https://www.imsglobal.org/spec/lti/v1p3/#role-vocabularies
// https://developerdocs.instructure.com/services/canvas/external-tools/file.canvas_roles
const INSTRUCTOR_LTI_ROLES = [
  // A system / site admin.
  'http://purl.imsglobal.org/vocab/lis/v2/system/person#SysAdmin',

  // Not used by Canvas, but maybe appropriate for other platforms?
  //'http://purl.imsglobal.org/vocab/lis/v2/system/person#Administrator',

  // An instructor within the overal institution / organization.
  'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Instructor',

  // An administrator within the overall institution / organization.
  'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator',

  // An instructor within the context (course / assignment) the user launched from.
  'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',

  // A content developer / designer within the context the user launched from.
  'http://purl.imsglobal.org/vocab/lis/v2/membership#ContentDeveloper',
]

export const isInstructor = (ltiRoles: string[]): boolean => {
  const ltiRoleSet = new Set(ltiRoles)

  // TODO: Should we also look for the TestUser role?  In Canvas, it indicates
  // that a Canvas instructor / admin is using the 'view as student' feature.
  // const isTestUser = ltiRoleSet.has('http://purl.imsglobal.org/vocab/lis/v2/system/person#TestUser')

  return INSTRUCTOR_LTI_ROLES.some((role) => ltiRoleSet.has(role))
}
