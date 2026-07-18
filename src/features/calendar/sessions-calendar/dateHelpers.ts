import { DAYS_FULL } from './constants';

export function getDayName(dateStr: string) {
    return DAYS_FULL[new Date(dateStr + 'T00:00:00').getDay()];
}
