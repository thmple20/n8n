export const exclude = (user: any, keys: any) => {
  for (const key of keys) {
    delete user[key]
  }
  return user
}

export const excludeArray = (alluser: any, keys: any) => {
  alluser.map((user: any) => {
    for (const key of keys) {
      delete user[key]
    }
  })

  return alluser
}