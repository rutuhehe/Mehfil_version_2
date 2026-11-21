import libphonenumber from 'google-libphonenumber'

const { PhoneNumberFormat, PhoneNumberUtil, PhoneNumberType } = libphonenumber

export { PhoneNumberFormat, PhoneNumberType }
export const phoneUtil = PhoneNumberUtil.getInstance()

export function parsePhoneNumber(value, defaultRegion = 'ZZ') {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    return phoneUtil.parse(value.trim(), defaultRegion || 'ZZ')
  } catch {
    return null
  }
}
