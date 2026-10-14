import LibraryPopup from 'reactjs-popup'
import type { ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react'
import type { PopupActions, PopupProps } from 'reactjs-popup/dist/types'

/** The library supports render-function children but omits them from its published types. */
type RenderPopupProps = Omit<PopupProps, 'children'> & {
  children: ReactNode | ((close: () => void, isOpen: boolean) => ReactNode)
}

export default LibraryPopup as ForwardRefExoticComponent<RenderPopupProps & RefAttributes<PopupActions>>
