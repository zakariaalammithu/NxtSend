import { describe, it, expect } from "vitest";
import {
  parseCsv,
  normalizeHeader,
  suggestColumnMapping,
  validateLeadRow,
  processCsvImport,
  escapeCsvField,
  leadsToCsv,
  type LeadFieldKey,
} from "@/lib/data/csv";
import type { Lead } from "@/types";

const EMPTY_VALUES = {
  first_name: "",
  last_name: "",
  email: "",
  company: "",
  job_title: "",
  linkedin_url: "",
  tags: "",
} satisfies Record<LeadFieldKey, string>;

describe("parseCsv", () => {
  it("parses simple rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles CRLF line endings and a trailing newline", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles quoted fields containing commas", () => {
    expect(parseCsv('name,company\n"Jane Doe","Acme, Inc."')).toEqual([
      ["name", "company"],
      ["Jane Doe", "Acme, Inc."],
    ]);
  });

  it("handles escaped quotes inside quoted fields", () => {
    expect(parseCsv('note\n"say ""hi"" now"')).toEqual([
      ["note"],
      ['say "hi" now'],
    ]);
  });

  it("handles newlines inside quoted fields", () => {
    expect(parseCsv('name,note\nJane,"line1\nline2"')).toEqual([
      ["name", "note"],
      ["Jane", "line1\nline2"],
    ]);
  });

  it("strips a UTF-8 BOM", () => {
    expect(parseCsv("\uFEFFa,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("returns no trailing empty row for a file ending in a newline", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("parses an empty string to zero rows", () => {
    expect(parseCsv("")).toEqual([]);
  });

  it("keeps empty cells", () => {
    expect(parseCsv("a,,c\n,2,")).toEqual([
      ["a", "", "c"],
      ["", "2", ""],
    ]);
  });
});

describe("suggestColumnMapping", () => {
  it("maps common header spellings", () => {
    const mapping = suggestColumnMapping([
      "First Name",
      "Last Name",
      "Email Address",
      "Company Name",
      "Title",
      "LinkedIn URL",
    ]);
    expect(mapping.first_name).toBe("First Name");
    expect(mapping.last_name).toBe("Last Name");
    expect(mapping.email).toBe("Email Address");
    expect(mapping.company).toBe("Company Name");
    expect(mapping.job_title).toBe("Title");
    expect(mapping.linkedin_url).toBe("LinkedIn URL");
  });

  it("normalizes weird header casing and punctuation", () => {
    expect(normalizeHeader("  E-Mail_Address ")).toBe("e mail address");
    const mapping = suggestColumnMapping(["FIRSTNAME", "Work Email"]);
    expect(mapping.first_name).toBe("FIRSTNAME");
    expect(mapping.email).toBe("Work Email");
  });

  it("leaves unmapped fields undefined", () => {
    const mapping = suggestColumnMapping(["Foo", "Bar"]);
    expect(mapping.email).toBeUndefined();
    expect(mapping.first_name).toBeUndefined();
  });
});

describe("validateLeadRow", () => {
  it("accepts a minimal valid row", () => {
    const { lead, errors } = validateLeadRow({
      ...EMPTY_VALUES,
      first_name: "Jane",
      email: "jane@acme.com",
    });
    expect(errors).toEqual([]);
    expect(lead?.email).toBe("jane@acme.com");
    expect(lead?.tags).toEqual([]);
  });

  it("rejects a row with neither an email nor a LinkedIn URL", () => {
    const { lead, errors } = validateLeadRow({
      ...EMPTY_VALUES,
      first_name: "Jane",
    });
    expect(lead).toBeUndefined();
    expect(
      errors.some((e) => e.includes("Missing email and LinkedIn URL"))
    ).toBe(true);
  });

  it("accepts a LinkedIn-URL-only row (My Network exports have no emails)", () => {
    const { lead, errors } = validateLeadRow({
      ...EMPTY_VALUES,
      first_name: "Jane",
      last_name: "Doe",
      linkedin_url: "https://www.linkedin.com/in/jane-doe",
    });
    expect(errors).toEqual([]);
    expect(lead?.email).toBeUndefined();
    expect(lead?.linkedin_url).toBe("https://www.linkedin.com/in/jane-doe");
  });

  it("still validates the email format when an email is present", () => {
    const { lead, errors } = validateLeadRow({
      ...EMPTY_VALUES,
      first_name: "Jane",
      email: "not-an-email",
      linkedin_url: "https://www.linkedin.com/in/jane-doe",
    });
    expect(lead).toBeUndefined();
    expect(errors.some((e) => e.includes("Invalid email"))).toBe(true);
  });

  it("rejects an invalid email", () => {
    const { lead, errors } = validateLeadRow({
      ...EMPTY_VALUES,
      first_name: "Jane",
      email: "not-an-email",
    });
    expect(lead).toBeUndefined();
    expect(errors.some((e) => e.includes("Invalid email"))).toBe(true);
  });

  it("rejects a missing first name", () => {
    const { lead, errors } = validateLeadRow({
      ...EMPTY_VALUES,
      email: "jane@acme.com",
    });
    expect(lead).toBeUndefined();
    expect(errors.some((e) => e.includes("Missing first name"))).toBe(true);
  });

  it("rejects a LinkedIn URL without a scheme", () => {
    const { lead, errors } = validateLeadRow({
      ...EMPTY_VALUES,
      first_name: "Jane",
      email: "jane@acme.com",
      linkedin_url: "linkedin.com/in/jane",
    });
    expect(lead).toBeUndefined();
    expect(errors.some((e) => e.includes("Invalid LinkedIn URL"))).toBe(true);
  });

  it("parses ';'-separated tags and trims values", () => {
    const { lead } = validateLeadRow({
      ...EMPTY_VALUES,
      first_name: "  Jane ",
      email: " jane@acme.com ",
      tags: " VIP ; Fintech ;",
    });
    expect(lead?.first_name).toBe("Jane");
    expect(lead?.email).toBe("jane@acme.com");
    expect(lead?.tags).toEqual(["VIP", "Fintech"]);
  });
});

describe("processCsvImport", () => {
  const HEADERS = ["First Name", "Last Name", "Email", "Company"];
  const MAPPING = {
    first_name: "First Name",
    last_name: "Last Name",
    email: "Email",
    company: "Company",
  };

  it("imports valid rows and counts them", () => {
    const rows = [
      HEADERS,
      ["Jane", "Doe", "jane@acme.com", "Acme"],
      ["John", "Smith", "john@beta.io", "Beta"],
    ];
    const result = processCsvImport(rows, MAPPING, []);
    expect(result.totalDataRows).toBe(2);
    expect(result.leads).toHaveLength(2);
    expect(result.errors).toEqual([]);
    expect(result.duplicates).toEqual([]);
  });

  it("flags duplicates against existing leads (case-insensitive)", () => {
    const rows = [HEADERS, ["Jane", "Doe", "JANE@acme.com", "Acme"]];
    const result = processCsvImport(rows, MAPPING, ["jane@acme.com"]);
    expect(result.leads).toHaveLength(0);
    expect(result.duplicates).toEqual([
      { row: 2, identity: "JANE@acme.com", reason: "existing" },
    ]);
  });

  it("flags duplicates within the file, keeping the first occurrence", () => {
    const rows = [
      HEADERS,
      ["Jane", "Doe", "jane@acme.com", "Acme"],
      ["Janet", "Doe", "jane@acme.com", "Acme 2"],
    ];
    const result = processCsvImport(rows, MAPPING, []);
    expect(result.leads).toHaveLength(1);
    expect(result.leads[0].first_name).toBe("Jane");
    expect(result.duplicates).toEqual([
      { row: 3, identity: "jane@acme.com", reason: "in-file" },
    ]);
  });

  it("imports LinkedIn-URL-only rows and dedupes on the URL", () => {
    const NET_HEADERS = ["First Name", "Last Name", "Profile URL"];
    const NET_MAPPING = {
      first_name: "First Name",
      last_name: "Last Name",
      linkedin_url: "Profile URL",
    };
    const rows = [
      NET_HEADERS,
      ["Jane", "Doe", "https://www.linkedin.com/in/jane-doe"],
      // Same person, trailing slash + case variant — still a duplicate.
      ["Jane", "Doe", "https://www.linkedin.com/in/Jane-Doe/"],
      ["John", "Smith", "https://www.linkedin.com/in/john-smith"],
    ];
    const result = processCsvImport(rows, NET_MAPPING, [], [
      "https://www.linkedin.com/in/john-smith",
    ]);
    expect(result.totalDataRows).toBe(3);
    expect(result.leads).toHaveLength(1);
    expect(result.leads[0].first_name).toBe("Jane");
    expect(result.leads[0].email).toBeUndefined();
    expect(result.duplicates).toEqual([
      {
        row: 3,
        identity: "https://www.linkedin.com/in/Jane-Doe/",
        reason: "in-file",
      },
      {
        row: 4,
        identity: "https://www.linkedin.com/in/john-smith",
        reason: "existing",
      },
    ]);
  });

  it("does not dedupe an email row against a LinkedIn-only row", () => {
    const rows = [
      ["First Name", "Email", "LinkedIn URL"],
      ["Jane", "jane@acme.com", ""],
      ["Janet", "", "https://www.linkedin.com/in/janet"],
    ];
    const result = processCsvImport(
      rows,
      { first_name: "First Name", email: "Email", linkedin_url: "LinkedIn URL" },
      []
    );
    expect(result.leads).toHaveLength(2);
    expect(result.duplicates).toEqual([]);
  });

  it("reports per-row errors with file row numbers", () => {
    const rows = [
      HEADERS,
      ["Jane", "Doe", "jane@acme.com", "Acme"],
      ["", "NoName", "noname@acme.com", "Acme"],
      ["Bob", "Bad", "not-an-email", "Acme"],
    ];
    const result = processCsvImport(rows, MAPPING, []);
    expect(result.leads).toHaveLength(1);
    expect(result.errors.map((e) => e.row)).toEqual([3, 4]);
    expect(result.totalDataRows).toBe(3);
  });

  it("skips fully-empty rows without counting them", () => {
    const rows = [
      HEADERS,
      ["Jane", "Doe", "jane@acme.com", "Acme"],
      ["", "", "", ""],
      [],
    ];
    const result = processCsvImport(rows, MAPPING, []);
    expect(result.totalDataRows).toBe(1);
    expect(result.leads).toHaveLength(1);
  });

  it("returns an empty result for a header-only file", () => {
    const result = processCsvImport([HEADERS], MAPPING, []);
    expect(result.totalDataRows).toBe(0);
    expect(result.leads).toEqual([]);
  });
});

describe("leadsToCsv / escapeCsvField", () => {
  it("escapes fields containing commas, quotes or newlines", () => {
    expect(escapeCsvField("plain")).toBe("plain");
    expect(escapeCsvField("a,b")).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });

  it("serializes leads with the export header row", () => {
    const lead: Lead = {
      id: "l1",
      workspace_id: "ws",
      first_name: "Jane",
      last_name: "Doe",
      email: "jane@acme.com",
      company: "Acme, Inc.",
      job_title: "CEO",
      linkedin_url: "https://linkedin.com/in/jane",
      status: "new",
      tags: ["VIP", "Fintech"],
      custom_fields: {},
      created_at: "2024-10-01T10:00:00.000Z",
    };
    const csv = leadsToCsv([lead]);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe(
      "First Name,Last Name,Email,Company,Job Title,LinkedIn URL,Status,Tags,Added"
    );
    expect(lines[1]).toContain('"Acme, Inc."');
    expect(lines[1]).toContain("VIP; Fintech");
    // Round-trip: parsing the export yields the same cell values.
    const parsed = parseCsv(csv);
    expect(parsed[1][0]).toBe("Jane");
    expect(parsed[1][3]).toBe("Acme, Inc.");
  });
});
