export function getErrorMessage(error: any) : string {
    if (error.message) {
        return error.message;
    }
    return error;
}
