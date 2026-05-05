import { Response } from 'express'
export class Responses {
  successResponse(res: Response, message: string, data: string) {
    return {
      status: 1,
      message,
      data,
    }
  }
  errorResponse(res: Response, error: { message: string }) {
    return {
      status: 0,
      message: error.message,
      error: error.message,
    }
  }
}
