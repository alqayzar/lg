import type { ComponentProps } from 'react'
import { cn } from 'cn'
import logo from '@/assets/logo.svg'

interface AppLogoProps extends Omit<ComponentProps<'img'>, 'src'> {}

export function AppLogo({ alt = 'Logo Loup Garou', className, ...props }: AppLogoProps) {
  return <img alt={alt} className={cn('app-logo object-contain', className)} src={logo} {...props} />
}
