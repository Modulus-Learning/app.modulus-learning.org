export class PartialDate {
  // Constants
  static readonly DAY_MASK: number = 0b000000000000000000000000011111
  static readonly MONTH_MASK: number = 0b000000000000000000000111100000
  static readonly YEAR_MASK: number = 0b011111111111111111111000000000
  static readonly SIGN_MASK: number = 0b100000000000000000000000000000

  static readonly ZERO_SIGN_MASK: number = 0b011111111111111111111111111111
  static readonly ZERO_YEAR_MASK: number = 0b100000000000000000000111111111
  static readonly ZERO_MONTH_MASK: number = 0b111111111111111111111000011111
  static readonly ZERO_DAY_MASK: number = 0b111111111111111111111111100000

  static readonly SIGN_SHIFT: number = 29
  static readonly YEAR_SHIFT: number = 9
  static readonly MONTH_SHIFT: number = 5

  static readonly REMOVALS: RegExp = /[/,\-\s]/

  static readonly MONTH_NAMES: string[] = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]

  static readonly ABBR_MONTH_NAMES: string[] = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ]

  private bits: number

  constructor(year = 0, month = 0, day = 0) {
    this.bits = 0
    if (year > 0) {
      this.setYear(year)
    }
    if (month > 0) {
      this.setMonth(month)
    }
    if (day > 0) {
      this.setDay(day)
    }
  }

  static load(value: number): PartialDate {
    const partialDate = new PartialDate()
    partialDate.setValue(value)
    return partialDate
  }

  getValue(): number {
    return PartialDate.getDate(this.bits)
  }

  setValue(value: number): void {
    if (Number.isInteger(value) && value >= -10485761231 && value <= 10485761231) {
      this.bits = PartialDate.setDate(this.bits, value)
    } else {
      throw new Error('Date value must be an integer between -10485761231 and 10485761231')
    }
  }

  setYear(value: number | null): void {
    let yearValue = 0
    if (value !== null) {
      yearValue = typeof value === 'string' ? Number.parseInt(value, 10) : value
    }

    if (yearValue >= -1048576 && yearValue <= 1048576) {
      this.bits = PartialDate.setYear(this.bits, yearValue)
    } else {
      throw new Error('Year must be an integer from -1048576 to 1048576')
    }
  }

  getYear(): number {
    return PartialDate.getYear(this.bits)
  }

  setMonth(value: number | null): void {
    let monthValue = 0
    if (value !== null) {
      monthValue = typeof value === 'string' ? Number.parseInt(value, 10) : value
    }

    if (monthValue >= 0 && monthValue <= 12) {
      this.bits = PartialDate.setMonth(this.bits, monthValue)
    } else {
      throw new Error('Month must be an integer between 0 and 12')
    }
  }

  getMonth(): number {
    return PartialDate.getMonth(this.bits)
  }

  setDay(value: number | null): void {
    let dayValue = 0
    if (value !== null) {
      dayValue = typeof value === 'string' ? Number.parseInt(value, 10) : value
    }

    if (dayValue >= 0 && dayValue <= 31) {
      if (this.getMonth() === 0 && dayValue !== 0) {
        throw new Error('A month must be set before a day')
      }
      // Validation for the day according to the month and leap year might be necessary
      this.bits = PartialDate.setDay(this.bits, dayValue)
    } else {
      throw new Error('Day must be an integer between 0 and 31')
    }
  }

  getDay(): number {
    return PartialDate.getDay(this.bits)
  }

  toString(): string {
    let year = ''
    let month = ''
    let day = ''
    let result = ''

    if (this.getYear() !== 0) {
      year = this.getYear().toString()
      if (this.getMonth() > 0) {
        // Ensuring month is always two digits
        month = this.getMonth().toString().padStart(2, '0')
        if (this.getDay() > 0) {
          // Ensuring day is always two digits
          day = this.getDay().toString().padStart(2, '0')
          result = `${year}-${month}-${day}`
        } else {
          result = `${year}-${month}`
        }
      } else {
        result = year
      }
    }

    return result
  }

  toShort(): string {
    let year = ''
    let month = ''
    let day = ''
    let result = ''

    if (this.getYear() !== 0) {
      year = this.getYear().toString()
      if (this.getMonth() > 0) {
        month = this.getMonth().toString().padStart(2, '0')
        if (this.getDay() > 0) {
          day = this.getDay().toString().padStart(2, '0')
          result = `${day}/${month}/${year}`
        } else {
          result = `${month} ${year}`
        }
      } else {
        result = year
      }
    }

    return result
  }

  toMedium(): string {
    let year = ''
    let month = ''
    let day = ''
    let result = ''

    if (this.getYear() !== 0) {
      year = this.getYear().toString()
      if (this.getMonth() > 0) {
        month = PartialDate.ABBR_MONTH_NAMES[this.getMonth() - 1]
        if (this.getDay() > 0) {
          day = this.getDay().toString().padStart(2, '0')
          result = `${day} ${month} ${year}`
        } else {
          result = `${month} ${year}`
        }
      } else {
        result = year
      }
    }

    return result
  }

  toLong(): string {
    let year = ''
    let month = ''
    let day = ''
    let result = ''

    if (this.getYear() !== 0) {
      year = this.getYear().toString()
      if (this.getMonth() > 0) {
        month = PartialDate.MONTH_NAMES[this.getMonth() - 1]
        if (this.getDay() > 0) {
          day = this.getDay().toString().padStart(2, '0')
          result = `${day} ${month} ${year}`
        } else {
          result = `${month} ${year}`
        }
      } else {
        result = year
      }
    }

    return result
  }

  static getDate(register: number): number {
    const sign = PartialDate.getSign(register) ? -1 : 1
    const year = PartialDate.getYear(register)
    const month = PartialDate.getMonth(register)
    const day = PartialDate.getDay(register)
    return (year * 10000 + month * 100 + day) * sign
  }

  static toString(value: number): string {
    let year = ''
    let month = ''
    let day = ''
    let result = ''

    const register = PartialDate.setDate(0, value)

    if (PartialDate.getYear(register) !== 0) {
      year = PartialDate.getYear(register).toString()
      if (PartialDate.getMonth(register) > 0) {
        // Ensuring month is always two digits
        month = PartialDate.getMonth(register).toString().padStart(2, '0')
        if (PartialDate.getDay(register) > 0) {
          // Ensuring day is always two digits
          day = PartialDate.getDay(register).toString().padStart(2, '0')
          result = `${year}-${month}-${day}`
        } else {
          result = `${year}-${month}`
        }
      } else {
        result = year
      }
    }

    return result
  }

  static setDate(register: number, value: number): number {
    let sign = 0
    let absValue = value
    if (absValue < 0) {
      sign = 1
      absValue = -absValue
    }
    const year = Math.floor(absValue / 10000)
    const month = Math.floor((absValue % 10000) / 100)
    const day = absValue % 100

    let result = PartialDate.setYear(register, year)
    result = PartialDate.setMonth(result, month)
    result = PartialDate.setDay(result, day)
    return PartialDate.setSign(result, sign)
  }

  // Additional methods (for completeness)
  static getSign(register: number): boolean {
    return (register & PartialDate.SIGN_MASK) !== 0
  }

  static setSign(register: number, value: number): number {
    if (value === 1) {
      return register | PartialDate.SIGN_MASK
    }
    return register & PartialDate.ZERO_SIGN_MASK
  }

  static getYear(register: number): number {
    return (
      ((register & PartialDate.YEAR_MASK) >> PartialDate.YEAR_SHIFT) *
      (PartialDate.getSign(register) ? -1 : 1)
    )
  }

  static setYear(register: number, value: number): number {
    const signAdjustedValue = value < 0 ? -value : value
    return (register & PartialDate.ZERO_YEAR_MASK) | (signAdjustedValue << PartialDate.YEAR_SHIFT)
  }

  static getMonth(register: number): number {
    return (register & PartialDate.MONTH_MASK) >> PartialDate.MONTH_SHIFT
  }

  static setMonth(register: number, value: number): number {
    return (register & PartialDate.ZERO_MONTH_MASK) | (value << PartialDate.MONTH_SHIFT)
  }

  static getDay(register: number): number {
    return register & PartialDate.DAY_MASK
  }

  static setDay(register: number, value: number): number {
    return (register & PartialDate.ZERO_DAY_MASK) | value
  }
}
