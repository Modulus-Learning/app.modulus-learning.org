/**
 * The Canvas substitution variables a Modulus deep-link content item asks
 * Canvas to expand into every later launch's custom claims. Existing resource
 * links keep the set they were created with, so removing a field affects only
 * links created afterwards.
 */
// For now, every field that might eventually be useful is listed here;
// once things settle down, we can remove the ones that aren't being used,
// and rename the ones we are.
export const CANVAS_CUSTOM_LAUNCH_FIELDS: Record<string, string> = {
  'User.id': '$User.id',
  'User.username': '$User.username',

  // Canvas doesn't include the next two
  'ActualUser.id': '$ActualUser.id',
  'ActualUser.username': '$ActualUser.username',

  'Context.id': '$Context.id',
  'Context.title': '$Context.title',
  // Canvas doesn't include the next two
  // 'Context.type': '$Context.type',
  // 'Context.label': '$Context.label',

  'ResourceLink.id': '$ResourceLink.id',
  'ResourceLink.title': '$ResourceLink.title',
  'ResourceLink.description': '$ResourceLink.description',
  'ResourceLink.available.startDateTime': '$ResourceLink.available.startDateTime',
  'ResourceLink.available.endDateTime': '$ResourceLink.available.endDateTime',
  'ResourceLink.submission.startDateTime': '$ResourceLink.submission.startDateTime',
  'ResourceLink.submission.endDateTime': '$ResourceLink.submission.endDateTime',
  // Canvas doesn't include the next four
  // 'ResourceLink.available.user.startDateTime': '$ResourceLink.available.user.startDateTime',
  // 'ResourceLink.available.user.endDateTime': '$ResourceLink.available.user.endDateTime',
  // 'ResourceLink.submission.user.startDateTime': '$ResourceLink.submission.user.startDateTime',
  // 'ResourceLink.submission.user.endDateTime': '$ResourceLink.submission.user.endDateTime',

  // Canvas-specific properties
  'Message.locale': '$Message.locale',

  'Canvas.account.id': '$Canvas.account.id',
  'Canvas.account.name': '$Canvas.account.name',
  'Canvas.user.id': '$Canvas.user.id',
  'Canvas.user.loginId': '$Canvas.user.loginId',
  'Canvas.masqueradingUser.id': '$Canvas.masqueradingUser.id',
  'Canvas.masqueradingUser.userId': '$Canvas.masqueradingUser.userId',
  'Canvas.course.id': '$Canvas.course.id',
  'Canvas.course.name': '$Canvas.course.name',
  'Canvas.course.startAt': '$Canvas.course.startAt',
  'Canvas.course.endAt': '$Canvas.course.endAt',
  'Canvas.course.gradePassbackSetting': '$Canvas.course.gradePassbackSetting',
  'Canvas.term.id': '$Canvas.term.id',
  'Canvas.term.name': '$Canvas.term.name',
  'Canvas.term.startAt': '$Canvas.term.startAt',
  'Canvas.term.endAt': '$Canvas.term.endAt',
  'Canvas.enrollment.enrollmentState': '$Canvas.enrollment.enrollmentState',
  'Canvas.module.id': '$Canvas.module.id',
  'Canvas.moduleItem.id': '$Canvas.moduleItem.id',
  'Canvas.assignment.id': '$Canvas.assignment.id',
  'Canvas.assignment.title': '$Canvas.assignment.title',
  'Canvas.assignment.description': '$Canvas.assignment.description',
  'Canvas.assignment.published': '$Canvas.assignment.published',
  'Canvas.assignment.pointsPossible': '$Canvas.assignment.pointsPossible',
  'Canvas.assignment.unlockAt.iso8601': '$Canvas.assignment.unlockAt.iso8601',
  'Canvas.assignment.lockAt.iso8601': '$Canvas.assignment.lockAt.iso8601',
  'Canvas.assignment.dueAt.iso8601': '$Canvas.assignment.dueAt.iso8601',
  'Canvas.assignment.allowedAttempts': '$Canvas.assignment.allowedAttempts',
  'Canvas.assignment.submission.studentAttempts': '$Canvas.assignment.submission.studentAttempts',

  'com.instructure.User.student_view': '$com.instructure.User.student_view',
  'com.instructure.Assignment.lti.id': '$com.instructure.Assignment.lti.id',
  'com.instructure.Assignment.description': '$com.instructure.Assignment.description',
  'com.instructure.Submission.id': '$com.instructure.Submission.id',
  'com.instructure.Context.globalId': '$com.instructure.Context.globalId',
  'com.instructure.Context.uuid': '$com.instructure.Context.uuid',
  'com.instructure.contextLabel': '$com.instructure.contextLabel',

  'vnd.instructure.Course.uuid': '$vnd.instructure.Course.uuid',
  'vnd.instructure.User.uuid': '$vnd.instructure.User.uuid',
  'vnd.instructure.User.current_uuid': '$vnd.instructure.User.current_uuid',

  'LineItem.resultValue.max': '$LineItem.resultValue.max',
}
