export const REGISTRATION_NAME_KEY = 'registration_name';

export type RegistrationName = {
    userId?: string;
    first_name: string;
    middle_name: string;
    last_name: string;
};

export function pickNameField(...candidates: Array<string | null | undefined>): string {
    for (const value of candidates) {
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
}

export function saveRegistrationName(name: RegistrationName) {
    try {
        sessionStorage.setItem(REGISTRATION_NAME_KEY, JSON.stringify(name));
    } catch {
        // sessionStorage may be unavailable; profile/user_metadata remain the source of truth
    }
}

export function readRegistrationName(userId?: string): RegistrationName | null {
    try {
        const raw = sessionStorage.getItem(REGISTRATION_NAME_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as RegistrationName;
        if (parsed.userId && userId && parsed.userId !== userId) return null;
        return {
            userId: parsed.userId,
            first_name: pickNameField(parsed.first_name),
            middle_name: pickNameField(parsed.middle_name),
            last_name: pickNameField(parsed.last_name),
        };
    } catch {
        return null;
    }
}

export function clearRegistrationName() {
    try {
        sessionStorage.removeItem(REGISTRATION_NAME_KEY);
    } catch {
        // ignore
    }
}

export function namesFromUserMetadata(metadata: Record<string, unknown> | null | undefined): RegistrationName {
    const meta = metadata ?? {};
    return {
        first_name: pickNameField(meta.first_name as string | undefined),
        middle_name: pickNameField(meta.middle_name as string | undefined),
        last_name: pickNameField(meta.last_name as string | undefined),
    };
}
