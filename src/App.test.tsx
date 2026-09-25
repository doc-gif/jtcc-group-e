// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import App from './App'

afterEach(cleanup)

test('利用者がアプリの状態と次の手順を把握できる', () => {
  render(<App />)
  const main = screen.getByRole('main')
  expect(within(main).getByRole('heading', { level: 1 })).toHaveTextContent('使いやすいアプリを。')
  expect(within(main).getByRole('heading', { name: '次に決めること' })).toBeVisible()
  expect(within(main).getAllByRole('listitem')).toHaveLength(3)
})
