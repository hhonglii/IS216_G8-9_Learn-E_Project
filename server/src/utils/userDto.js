// The user fields the API sends back. The password hash and anything else on
// the document stay on the server.
export function toUserResponse(user){
    return {
      id: String(user._id),
      username: user.username ?? null,
      displayName: user.displayName,
      role: user.role,
    };
}