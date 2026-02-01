/**
 * Represents a KafkaJS DeleteGroups error with detailed information about failed groups
 */
interface KafkaJSDeleteGroupsError extends Error {
    groups?: Array<{
        groupId: string;
        errorCode?: number;
        error?: Error;
    }>;
}

/**
 * Represents a KafkaJS Protocol error with error code and type
 */
interface KafkaJSProtocolError extends Error {
    code?: number;
    type?: string;
}

/**
 * Represents a KafkaJS Connection error with broker information
 */
interface KafkaJSConnectionError extends Error {
    broker?: string;
}

/**
 * Represents a KafkaJS Request Timeout error with detailed timing information
 */
interface KafkaJSRequestTimeoutError extends Error {
    broker?: string;
    correlationId?: number;
    pendingDuration?: number;
}

/**
 * Represents a generic KafkaJS error with retry information
 */
interface KafkaJSError extends Error {
    retriable?: boolean;
    helpUrl?: string;
    cause?: Error;
    retryCount?: number;
    retryTime?: number;
}

/**
 * Type guard to check if error is a KafkaJSDeleteGroupsError
 */
function isKafkaJSDeleteGroupsError(error: any): error is KafkaJSDeleteGroupsError {
    return error && error.name === 'KafkaJSDeleteGroupsError' && Array.isArray(error.groups);
}

/**
 * Type guard to check if error is a KafkaJSProtocolError
 */
function isKafkaJSProtocolError(error: any): error is KafkaJSProtocolError {
    return error && error.name === 'KafkaJSProtocolError' && (error.code !== undefined || error.type !== undefined);
}

/**
 * Type guard to check if error is a KafkaJSConnectionError
 */
function isKafkaJSConnectionError(error: any): error is KafkaJSConnectionError {
    return error && error.name === 'KafkaJSConnectionError' && error.broker !== undefined;
}

/**
 * Type guard to check if error is a KafkaJSRequestTimeoutError
 */
function isKafkaJSRequestTimeoutError(error: any): error is KafkaJSRequestTimeoutError {
    return error && error.name === 'KafkaJSRequestTimeoutError';
}

/**
 * Type guard to check if error is a KafkaJSError with additional metadata
 */
function isKafkaJSError(error: any): error is KafkaJSError {
    return error && typeof error.name === 'string' && error.name.startsWith('KafkaJS');
}

/**
 * Extracts a user-friendly error message from various error types, with special handling
 * for KafkaJS errors to include additional context like group IDs, error codes, and states.
 * 
 * @param error - The error object to extract a message from
 * @returns A formatted error message string with relevant details
 */
export function getErrorMessage(error: any): string {
    // Handle KafkaJSDeleteGroupsError with detailed group information
    if (isKafkaJSDeleteGroupsError(error)) {
        const baseMessage = error.message || 'Error deleting consumer groups';
        
        if (error.groups && error.groups.length > 0) {
            const groupDetails = error.groups.map(group => {
                let detail = `Group '${group.groupId}'`;
                
                if (group.error) {
                    // Extract meaningful error message from the group error
                    const errorMsg = group.error.message || group.error.toString();
                    detail += `: ${errorMsg}`;
                    
                    // Add error code if available
                    if (group.errorCode !== undefined) {
                        detail += ` (error code: ${group.errorCode})`;
                    }
                } else if (group.errorCode !== undefined) {
                    detail += `: error code ${group.errorCode}`;
                }
                
                return detail;
            }).join('; ');
            
            return `${baseMessage}. ${groupDetails}`;
        }
        
        return baseMessage;
    }
    
    // Handle KafkaJSProtocolError with error code and type
    if (isKafkaJSProtocolError(error)) {
        let message = error.message || 'Protocol error';
        const details: string[] = [];
        
        if (error.type) {
            details.push(`type: ${error.type}`);
        }
        if (error.code !== undefined) {
            details.push(`code: ${error.code}`);
        }
        
        if (details.length > 0) {
            message += ` (${details.join(', ')})`;
        }
        
        return message;
    }
    
    // Handle KafkaJSConnectionError with broker information
    if (isKafkaJSConnectionError(error)) {
        const message = error.message || 'Connection error';
        return error.broker ? `${message} - Broker: ${error.broker}` : message;
    }
    
    // Handle KafkaJSRequestTimeoutError with timing details
    if (isKafkaJSRequestTimeoutError(error)) {
        const message = error.message || 'Request timeout';
        const details: string[] = [];
        
        if (error.broker) {
            details.push(`broker: ${error.broker}`);
        }
        if (error.correlationId !== undefined) {
            details.push(`correlation ID: ${error.correlationId}`);
        }
        if (error.pendingDuration !== undefined) {
            details.push(`pending: ${error.pendingDuration}ms`);
        }
        
        if (details.length > 0) {
            return `${message} (${details.join(', ')})`;
        }
        
        return message;
    }
    
    // Handle other KafkaJS errors with generic metadata
    if (isKafkaJSError(error)) {
        let message = error.message || error.toString();
        const metadata: string[] = [];
        
        if (error.retriable !== undefined) {
            metadata.push(error.retriable ? 'retriable' : 'non-retriable');
        }
        if (error.retryCount !== undefined) {
            metadata.push(`retries: ${error.retryCount}`);
        }
        if (error.retryTime !== undefined) {
            metadata.push(`retry time: ${error.retryTime}ms`);
        }
        
        if (metadata.length > 0) {
            message += ` (${metadata.join(', ')})`;
        }
        
        // Include cause if available
        if (error.cause) {
            const causeMsg = error.cause.message || error.cause.toString();
            message += `. Caused by: ${causeMsg}`;
        }
        
        // Include help URL if available
        if (error.helpUrl) {
            message += `. See: ${error.helpUrl}`;
        }
        
        return message;
    }
    
    // Handle standard Error objects
    if (error instanceof Error) {
        return error.message;
    }
    
    // Handle string errors
    if (typeof error === 'string') {
        return error;
    }
    
    // Fallback for unknown error types
    try {
        return String(error);
    } catch {
        return 'Unknown error occurred';
    }
}
