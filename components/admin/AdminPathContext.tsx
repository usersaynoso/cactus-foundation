'use client'

import { createContext, useContext } from 'react'

const AdminPathContext = createContext('cactus-admin')
export const AdminPathProvider = AdminPathContext.Provider
export function useAdminPath() { return useContext(AdminPathContext) }
