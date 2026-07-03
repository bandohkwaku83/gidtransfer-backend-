export const providerSignInHint = (authProvider) => {
    if (authProvider === "google") {
        return "This account uses Google. Continue with Google instead."
    }
    if (authProvider === "apple") {
        return "This account uses Apple. Continue with Apple instead."
    }
    return "Invalid credentials"
}
