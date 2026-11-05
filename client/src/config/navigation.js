// ════════════════════════════════════════════════════════════════════
//  Learn-E — navigation destinations
//  Dashboard and Take a break are global. Classroom links need a classroom id
//  and the profile link needs the logged-in id, so App.vue builds those
//  (decisions A-6, A-7). Each icon names a drawing in icons.js.
// ════════════════════════════════════════════════════════════════════

export const navigation = [
  { label: 'Dashboard', to: { name: 'dashboard' }, icon: 'dashboard' },
  { label: 'Take a break', to: { name: 'take-a-break' }, icon: 'break' },
]

export function classroomNavigation(classroomId) {
  return [
    {
      label: 'Classroom',
      to: { name: 'classroom', params: { classroomId } },
      icon: 'classroom',
    },
    {
      label: 'Help queue',
      to: { name: 'help-queue', params: { classroomId } },
      icon: 'help',
    },
  ]
}
