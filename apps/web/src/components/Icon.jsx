import * as icons from 'lucide-react'

export default function Icon({ name, ...props }) {
  const Cmp = icons[name] || icons.Circle
  return <Cmp {...props} />
}
