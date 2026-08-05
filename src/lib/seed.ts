import {
  DEFAULT_SENIOR_PASSWORDS,
  hashPassword,
  SENIOR_NAMES,
} from "./passwords";
import { ADMIN_NAME, type Database, type Person, type Role } from "./types";

function id(prefix: string, index: number) {
  return `${prefix}-${String(index).padStart(3, "0")}`;
}

const roleDefs: Array<{ key: string; name: string }> = [
  { key: "general", name: "גנרל" },
  { key: "melamed", name: "מלמד (שיעור א')" },
  { key: "kitchen", name: "מנהל מטבח" },
  { key: "mishbakim-mgr", name: "מנהל משבקי״ם" },
  { key: "tech-mgr", name: "מנהל צוות טכני" },
  { key: "shlofta-mgr", name: "מנהל שלאפט א חסיד" },
  { key: "mear", name: "מע״ר" },
  { key: "designer", name: "מעצב" },
  { key: "mefaked", name: "מפקד (שיעור ב')" },
  { key: "mishbak", name: "משב״ק" },
  { key: "tech", name: "צוות טכני" },
  { key: "office", name: "צוות מזכירות" },
  { key: "malash", name: "צוות מל״ש" },
  { key: "media", name: "צוות צילום וסושיאל" },
  { key: "officer", name: "קצין" },
  { key: "leadership", name: "הנהלה בכירה" },
];

const peopleByRole: Record<string, string[]> = {
  general: [
    "לוי יצחק ורדי",
    "נחמן ברדה",
    "מנחם מענדל גבירץ",
    "אליעזר נתן קפלן",
  ],
  melamed: [
    "שמוליק ביסטריצקי",
    "שמואל גלבשטיין",
    "שמואל כהן",
    "הלל כהן",
    "לוי יצחק לבנוני",
    "מנחם מענדל מרקוביץ",
    "מנחם מענדל קוצובייבסקי",
    "לוי יצחק ריינהרץ",
    "גרשון אריאל רסקין",
    "מנחם מענדל בוקיעט",
    "פנחס הורביץ",
    "שניאור זלמן ישעיהו",
    "מנחם מענדל קוביטשעק",
    "יששכר דוב רוזנשיין",
    "מיכאל מנחם רז",
    "מנחם מענדל בטשוילי",
    "לוי יצחק וולף",
    "נתן וישצקי",
    "דוד חנזין",
    "שלום דב בער ליסון",
    "שלום אורי נתן נטע נפרסטק",
    "שניאור זלמן סוליש",
    "מנחם מענדל סלפושניק",
    "שמואל קלמן",
    "יחזקאל פינסון",
    "אריאל שלום תעיזי",
  ],
  kitchen: ["שמואל טורנהיים", "לוי יצחק טורנהיים"],
  "mishbakim-mgr": ["מאיר בורובסקי", "שלום כהן", "שניאור זלמן קשת"],
  "tech-mgr": ["דוב בער הרטמן"],
  "shlofta-mgr": ["לוי דרוקמן", "יוסף יצחק קירשנבוים"],
  mear: ["יוסף יצחק כהן"],
  designer: ["ישראל שניאור זלמן הכהן"],
  mefaked: [
    "מנחם מענדל אלטהויז",
    "שניאור זלמן ארבוב",
    "מנחם מענדל בר נתן",
    "מנחם מענדל סויסא",
    "נחמן סימקין",
    "מנחם מענדל רייניץ",
    "יהונתן שם-טוב חקוקי",
    "מנחם מענדל כהן",
    "יוסף יצחק כהן",
    "שלמה אליהו פישר",
    "זלמן בוטמן",
    "ישראל ברוק",
    "איתמר סאפראן",
    "מנחם מענדל לביוב",
    "אלעזר מימון הכהן",
    "מנחם מענדל גלמן",
    "ישראל זהר",
  ],
  mishbak: [
    "שלום דובער לוייב",
    "שניאור זלמן שרמן",
    "צבי יעקב הכהן הרמתי",
    "יוסף יצחק נריה לוייב",
    "יוסף יצחק מרזל",
    "יהונתן בנימין בורגן",
    "מנחם מענדל נימוי",
    "יוסף יצחק בר כוכבא",
    "מנחם מענדל פאכערט",
    "ארי ברוד",
    "שלום דובער פרידמן",
    "מנחם מענדל גולדובסקי",
    "שלום דובער פז",
    "הילל רז",
  ],
  tech: ["אלחנן גליצנשטיין", "שניאור זלמן רוזנשיין", "יוסף יצחק טוביה קישון"],
  office: ["שלום דובער ישראל סויסא", "זכריה תעיזי"],
  malash: ["יוסף יצחק אחיטוב", "נתן סגל"],
  media: ["ראובן וגנר", "אפרים סלאווין", "יצחק פולק"],
  officer: [
    "נתן שמחה גרינברג",
    "לוי יצחק ערד",
    "שמואל פינחס חזן",
    "מנחם מענדל בורנשטיין",
  ],
  leadership: ["מענדל קשת", "חיים וייספיש", "יעקב קנייבסקי"],
};

export function createSeedDatabase(): Database {
  const roles: Role[] = roleDefs.map((role, index) => ({
    id: id("role", index + 1),
    name: role.name,
    sortOrder: index + 1,
  }));

  const roleIdByKey = Object.fromEntries(
    roleDefs.map((role, index) => [role.key, roles[index].id]),
  );

  const people: Person[] = [];
  let personIndex = 1;

  for (const [key, names] of Object.entries(peopleByRole)) {
    for (const name of names) {
      const isSenior = SENIOR_NAMES.has(name);
      const defaultPassword = DEFAULT_SENIOR_PASSWORDS[name];
      people.push({
        id: id("person", personIndex++),
        name,
        roleId: roleIdByKey[key],
        isSenior,
        isAdmin: name === ADMIN_NAME,
        passwordHash:
          isSenior && defaultPassword
            ? hashPassword(defaultPassword)
            : undefined,
        usesDefaultPassword: isSenior ? true : undefined,
      });
    }
  }

  return {
    roles,
    people,
    assignments: [],
    claimRequests: [],
    updatedAt: new Date().toISOString(),
  };
}
