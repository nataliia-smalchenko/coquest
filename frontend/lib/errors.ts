import axios from "axios";

/** Returns the API error detail message, if the error is an Axios response error. */
export function getApiDetail(err: unknown): string | undefined {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    return typeof detail === "string" ? detail : undefined;
  }
  return undefined;
}

/** Returns the HTTP status code, if the error is an Axios response error. */
export function getApiStatus(err: unknown): number | undefined {
  if (axios.isAxiosError(err)) return err.response?.status;
  return undefined;
}
