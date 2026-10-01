import { apiRead, apiWrite } from "@/lib/api/client"
import type { Page, Role, User, UserInput } from "@/lib/api/types"

export const USERS_PAGE_SIZE = 6

// La API no devuelve el total: se pagina con `has_more`.
export function listUsers(offset: number): Promise<Page<User>> {
  return apiRead<Page<User>>(`/users?limit=${USERS_PAGE_SIZE}&offset=${offset}`)
}

export function createUser(input: UserInput): Promise<User> {
  return apiWrite<User>("POST", "/users", input)
}

export function updateUser(id: string, changes: { full_name?: string; role?: Role }): Promise<User> {
  return apiWrite<User>("PATCH", `/users/${id}`, changes)
}

export function setUserActive(id: string, active: boolean): Promise<User> {
  return apiWrite<User>("POST", `/users/${id}/${active ? "activate" : "deactivate"}`)
}
