const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 6

export const parseSignUpInput = (body) => {
    const { email, password, acceptedTerms } = body
    const errors = []

    const normalizedEmail = email?.trim().toLowerCase() ?? ""
    if (!normalizedEmail) {
        errors.push("Email is required")
    } else if (!EMAIL_REGEX.test(normalizedEmail)) {
        errors.push("A valid email is required")
    }

    const trimmedPassword = password ?? ""
    if (!trimmedPassword) {
        errors.push("Password is required")
    } else if (trimmedPassword.length < MIN_PASSWORD_LENGTH) {
        errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    }

    if (acceptedTerms !== true) {
        errors.push("You must agree to the Terms and Privacy Policy")
    }

    if (errors.length) {
        return { fields: null, errors }
    }

    return {
        fields: {
            email: normalizedEmail,
            password: trimmedPassword,
            authProvider: "email",
            agreedToTermsAt: new Date(),
        },
        errors: [],
    }
}
