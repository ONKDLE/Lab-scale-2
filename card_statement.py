import re
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, List, Sequence

import xlrd


HEADER_DATETIME = "이용일시"
HEADER_MERCHANT = "이용하신곳"
HEADER_AMOUNT = "이용금액"
HEADER_STATUS = "상태"
HEADER_PAYMENT = "결제방법"
HEADER_CARD = "이용카드명"

KB_DATE = "이용일"
KB_TIME = "이용시간"
KB_MERCHANT = "이용하신곳"
KB_AMOUNT = "국내이용금액(원)"
KB_STATUS = "상태"

MAX_MERCHANT_LENGTH = 100


class StatementFormatError(ValueError):
    pass


@dataclass
class ParsedRow:
    row_number: int
    transaction_date: date
    transaction_time: str
    merchant_name: str
    amount: Decimal
    status: str
    raw_status: str
    payment_method: str
    card_name: str


@dataclass
class RowError:
    row_number: int
    reason: str


@dataclass
class ParseResult:
    rows: List[ParsedRow] = field(default_factory=list)
    errors: List[RowError] = field(default_factory=list)


def _normalize(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", "", str(value)).strip()


def _is_blank(value: Any) -> bool:
    return value is None or str(value).strip() == ""


def read_xls_rows(content: bytes) -> tuple[List[List[Any]], int]:
    try:
        book = xlrd.open_workbook(file_contents=content)
    except Exception as error:
        raise StatementFormatError(
            "XLS 파일을 읽을 수 없습니다. 카드사에서 받은 .xls 파일인지 확인해 주세요."
        ) from error

    if book.nsheets == 0:
        raise StatementFormatError("XLS 파일에 시트가 없습니다.")

    sheet = book.sheet_by_index(0)
    rows = [
        sheet.row_values(index)
        for index in range(sheet.nrows)
    ]

    return rows, book.datemode


def _find_header(
    rows: Sequence[Sequence[Any]],
) -> tuple[int, dict[str, int], str]:

    for index, row in enumerate(rows):
        positions: dict[str, int] = {}

        for column, value in enumerate(row):
            name = _normalize(value)

            if name and name not in positions:
                positions[name] = column

        # 기존 형식
        standard_required = (
            _normalize(HEADER_DATETIME),
            _normalize(HEADER_MERCHANT),
            _normalize(HEADER_AMOUNT),
        )

        if all(header in positions for header in standard_required):
            return index, positions, "standard"

        # KB국민카드 형식
        kb_required = (
            _normalize(KB_DATE),
            _normalize(KB_TIME),
            _normalize(KB_MERCHANT),
        )

        kb_amount_headers = (
            _normalize(KB_AMOUNT),
            "국내이용금액",
            "이용금액",
        )

        if (
            all(header in positions for header in kb_required)
            and any(header in positions for header in kb_amount_headers)
        ):
            for amount_header in kb_amount_headers:
                if amount_header in positions:
                    positions["_KB_AMOUNT"] = positions[amount_header]
                    break

            return index, positions, "kb"

    raise StatementFormatError(
        "이용내역 형식을 찾지 못했습니다. "
        "국민카드 XLS 형식 또는 MyPin 이용내역 형식인지 확인해 주세요."
    )


def _parse_date(value: Any, datemode: int) -> date:
    if isinstance(value, (int, float)):
        try:
            parsed = xlrd.xldate_as_datetime(value, datemode)
            return parsed.date()
        except Exception as error:
            raise ValueError(
                f"이용일을 읽을 수 없습니다. ({value})"
            ) from error

    text = str(value).strip()

    patterns = [
        r"^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$",
        r"^(\d{4})[-./](\d{1,2})[-./](\d{1,2})\s+.*$",
    ]

    for pattern in patterns:
        match = re.match(pattern, text)

        if match:
            try:
                return date(
                    int(match.group(1)),
                    int(match.group(2)),
                    int(match.group(3)),
                )
            except ValueError as error:
                raise ValueError(
                    f"존재하지 않는 날짜입니다. ({text})"
                ) from error

    raise ValueError(f"이용일을 읽을 수 없습니다. ({text})")


def _parse_datetime(
    value: Any,
    datemode: int,
) -> tuple[date, str]:

    if isinstance(value, (int, float)):
        try:
            parsed = xlrd.xldate_as_datetime(value, datemode)
            return parsed.date(), parsed.strftime("%H:%M")
        except Exception as error:
            raise ValueError(
                f"이용일시를 읽을 수 없습니다. ({value})"
            ) from error

    text = str(value).strip()

    match = re.match(
        r"^(\d{4})[-./](\d{1,2})[-./](\d{1,2})"
        r"(?:\s+(\d{1,2}):(\d{2}))?",
        text,
    )

    if not match:
        raise ValueError(
            f"이용일시를 읽을 수 없습니다. ({text!r})"
        )

    year, month, day, hour, minute = match.groups()

    try:
        parsed_date = date(
            int(year),
            int(month),
            int(day),
        )
    except ValueError as error:
        raise ValueError(
            f"존재하지 않는 날짜입니다. ({text!r})"
        ) from error

    time_text = ""

    if hour is not None:
        time_text = f"{int(hour):02d}:{minute}"

    return parsed_date, time_text


def _parse_time(value: Any) -> str:
    if _is_blank(value):
        return ""

    if isinstance(value, (int, float)):
        try:
            total_seconds = int(round(float(value) * 24 * 60 * 60))
            hour = (total_seconds // 3600) % 24
            minute = (total_seconds % 3600) // 60
            return f"{hour:02d}:{minute:02d}"
        except Exception:
            return ""

    text = str(value).strip()

    match = re.search(r"(\d{1,2}):(\d{2})", text)

    if match:
        return f"{int(match.group(1)):02d}:{match.group(2)}"

    return ""


def _parse_amount(value: Any) -> Decimal:
    if value is None or str(value).strip() == "":
        raise ValueError("이용금액이 비어 있습니다.")

    if isinstance(value, (int, float)):
        text = str(value)
    else:
        text = str(value).strip()

    text = (
        text.replace(",", "")
        .replace("원", "")
        .replace("₩", "")
        .strip()
    )

    # 괄호 형태의 금액도 처리
    text = re.sub(r"[^\d.\-]", "", text)

    try:
        amount = Decimal(text)
    except InvalidOperation as error:
        raise ValueError(
            f"금액을 읽을 수 없습니다. ({value!r})"
        ) from error

    if not amount.is_finite():
        raise ValueError(
            f"금액을 읽을 수 없습니다. ({value!r})"
        )

    if amount <= 0:
        raise ValueError(
            f"금액이 0 이하입니다. ({amount})"
        )

    return amount.quantize(Decimal("0.01"))


def parse_rows(
    rows: Sequence[Sequence[Any]],
    datemode: int = 0,
) -> ParseResult:

    header_index, columns, statement_format = _find_header(rows)

    def cell(row: Sequence[Any], header: str) -> Any:
        column = columns.get(_normalize(header))

        if column is None or column >= len(row):
            return None

        return row[column]

    result = ParseResult()

    for index in range(header_index + 1, len(rows)):
        row = rows[index]

        if all(_is_blank(value) for value in row):
            continue

        row_number = index + 1

        try:
            if statement_format == "kb":
                date_value = cell(row, KB_DATE)
                time_value = cell(row, KB_TIME)
                merchant_value = cell(row, KB_MERCHANT)

                if _is_blank(date_value):
                    raise ValueError("이용일이 비어 있습니다.")

                transaction_date = _parse_date(
                    date_value,
                    datemode,
                )

                transaction_time = _parse_time(time_value)

                merchant = str(
                    merchant_value or ""
                ).strip()

                amount_column = columns["_KB_AMOUNT"]

                if amount_column >= len(row):
                    amount_value = None
                else:
                    amount_value = row[amount_column]

                raw_status = str(
                    cell(row, KB_STATUS) or ""
                ).strip()

                payment_method = ""
                card_name = ""

            else:
                transaction_date, transaction_time = _parse_datetime(
                    cell(row, HEADER_DATETIME),
                    datemode,
                )

                merchant = str(
                    cell(row, HEADER_MERCHANT) or ""
                ).strip()

                amount_value = cell(row, HEADER_AMOUNT)

                raw_status = str(
                    cell(row, HEADER_STATUS) or ""
                ).strip()

                payment_method = str(
                    cell(row, HEADER_PAYMENT) or ""
                ).strip()

                card_name = str(
                    cell(row, HEADER_CARD) or ""
                ).strip()

            if not merchant:
                raise ValueError(
                    "이용하신곳(가맹점명)이 비어 있습니다."
                )

            amount = _parse_amount(amount_value)

        except ValueError as error:
            result.errors.append(
                RowError(
                    row_number=row_number,
                    reason=str(error),
                )
            )
            continue

        cancelled_keywords = (
            "취소",
            "매출취소",
            "승인취소",
            "취소완료",
        )

        status = (
            "CANCELLED"
            if any(
                keyword in raw_status
                for keyword in cancelled_keywords
            )
            else "ACTIVE"
        )

        result.rows.append(
            ParsedRow(
                row_number=row_number,
                transaction_date=transaction_date,
                transaction_time=transaction_time,
                merchant_name=merchant[:MAX_MERCHANT_LENGTH],
                amount=amount,
                status=status,
                raw_status=raw_status,
                payment_method=payment_method,
                card_name=card_name,
            )
        )

    return result


def parse_card_statement_xls(content: bytes) -> ParseResult:
    rows, datemode = read_xls_rows(content)
    return parse_rows(rows, datemode)