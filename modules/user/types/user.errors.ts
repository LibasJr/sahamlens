import { AppError, UnauthorizedError, ConflictError, ValidationError } from '../../../shared/errors/app-error';

export class InvalidCredentialsError extends UnauthorizedError {
  constructor() {
    super('Email atau password salah.');
  }
}

// PENTING: bukan UnauthorizedError (401) - perilaku aslinya (sebelum migrasi DDD)
// mengembalikan 403 untuk akun yang belum verifikasi. Extend AppError langsung
// karena butuh status 403 dengan code sendiri (EMAIL_NOT_VERIFIED), bukan FORBIDDEN.
export class EmailNotVerifiedError extends AppError {
  constructor() {
    super('Akun belum diverifikasi.', 403, 'EMAIL_NOT_VERIFIED');
  }
}

export class EmailAlreadyRegisteredError extends ConflictError {
  constructor() {
    super('Email sudah terdaftar dan terverifikasi');
  }
}

export class InvalidVerificationCodeError extends ValidationError {
  constructor() {
    super('Kode verifikasi salah');
  }
}

export class VerificationCodeExpiredError extends ValidationError {
  constructor() {
    super('Kode verifikasi sudah kedaluwarsa. Silakan minta kode baru.');
  }
}

export class InvalidResetCodeError extends ValidationError {
  constructor() {
    super('Kode reset salah atau kedaluwarsa.');
  }
}

export class ResetCodeExpiredError extends ValidationError {
  constructor() {
    super('Kode reset sudah kedaluwarsa. Silakan request ulang.');
  }
}
