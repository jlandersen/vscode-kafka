const maxNameLength = 249;
const legalChars = /^[a-zA-Z0-9\\._\\-]*$/;

export namespace CommonsValidator {
    export function validateTopic(topic?: string, existingTopicNames: string[] = [], topicField = 'The topic'): string | undefined {
        // See topic name validation rule at https://github.com/apache/kafka/blob/8007211cc982d8458223e866c1ee7d94b69e0249/core/src/main/scala/kafka/common/Topic.scala#L33
        let result = validateFieldRequired(topicField, topic);
        if (result) {
            return result;
        }
        if (!topic) {
            // Already managed with validateFieldRequired
        } else if (topic === "." || topic === "..") {
            return `${topicField} cannot be '.' or '..'`;
        }
        else if (topic.length > maxNameLength) {
            return `${topicField} is illegal, cannot be longer than ${maxNameLength} characters`;
        }
        else if (!legalChars.test(topic)) {
            return `${topicField} '${topic}' is illegal, contains a character other than ASCII alphanumerics, '.', '_' and '-'`;
        }
        if (!topic) {
            return 'The topic value is required.';
        }
        return validateFieldUniqueValue(topicField, topic, existingTopicNames);
    }

    export function validateFieldRequired(name: string, value?: string): string | undefined {
        if (!value || value.length <= 0) {
            return `${name} is required.`;
        }
        if (value.trim().length === 0) {
            return `${name} cannot be blank.`;
        }
    }

    export function validateFieldUniqueValue(name: string, value: string, values: string[]): string | undefined {
        if (values.indexOf(value) !== -1) {
            return `${name} '${value}' already exists.`;
        }
    }

    export function validateFieldPositiveNumber(name: string, value: string, max?: number): string | undefined {
        const valueAsNumber = Number(value);
        if (isNaN(valueAsNumber) || valueAsNumber < 1) {
            return `${name} must be a positive number.`;
        }
        if (max && valueAsNumber > max) {
            return `${name} can not be greater than ${max}.`;
        }
    }

}
