import type {S3ServiceException} from '@aws-sdk/client-s3'

export function objectUnavailable(error: unknown) {
  const {name,$metadata}=error as Partial<S3ServiceException>
  return ['AccessDenied','Forbidden','NoSuchKey','NotFound'].includes(name??'') ||
    $metadata?.httpStatusCode===403 || $metadata?.httpStatusCode===404
}

export function objectAlreadyWritten(error: unknown) {
  const {name,$metadata}=error as Partial<S3ServiceException>
  return name==='PreconditionFailed' || $metadata?.httpStatusCode===412
}
