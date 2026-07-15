import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'

import UnauthorizedPage from '@/app/(auth)/unauthorized/page'

it('renders an explicit access denial', () => {
  const html = renderToStaticMarkup(<UnauthorizedPage />)

  expect(html).toContain('Access denied')
  expect(html).toContain('Junaspark')
})
