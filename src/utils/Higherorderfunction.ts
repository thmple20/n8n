export const isValEmpty = (obj: { [key: string]: any }) => {
  const updatedObj: { [key: string]: any } = {};

  const objToString = Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [key, String(value)]),
  );
  for (const key in objToString) {
    if (Object.prototype.hasOwnProperty.call(objToString, key)) {
      updatedObj[key] = objToString[key] === "null" ? "" : objToString[key];
    }
  }
  return updatedObj;
};

export function generateId(length: number): string {
  const characters =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters[randomIndex];
  }
  return result;
}

export const insertDataQuery = (
  table_name: string,
  fieldsToUpdate: Record<string, any>,
  time?: number,
  userId?: number,
) => {
  const columns: string[] = [];
  const placeholders: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  for (const field in fieldsToUpdate) {
    if (Object.prototype.hasOwnProperty.call(fieldsToUpdate, field)) {
      // Quote column names to handle case sensitivity
      columns.push(`"${field}"`);
      placeholders.push(`$${paramIndex}`);
      values.push(fieldsToUpdate[field]);
      paramIndex++;
    }
  }

  if (time) {
    columns.push('"time"', '"author_id"', '"order_status"');
    placeholders.push(
      `$${paramIndex++}`,
      `$${paramIndex++}`,
      `$${paramIndex++}`,
    );
    values.push(time, userId, "pending");
  }

  const insertQuery = `INSERT INTO ${table_name} (${columns.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`;

  return { insertQuery, insertParams: values };
};

export const updateDataSelectedFields = (
  fieldsToUpdate: Record<string, any>,
  id: any,
  where_query: string,
  table_name: string,
) => {
  let updateQuery = `UPDATE ${table_name} SET `;
  const updateParams = [];
  let paramIndex = 1;

  const fieldAssignments = Object.keys(fieldsToUpdate).map((field) => {
    updateParams.push(fieldsToUpdate[field]);
    // Wrap column names in double quotes for camelCase handling
    return `"${field}" = $${paramIndex++}`;
  });

  updateQuery += fieldAssignments.join(", ");
  updateQuery += ` WHERE "${where_query}" = $${paramIndex}`;
  updateParams.push(id);

  return { updateQuery, updateParams };
};

export const isValEmptyArray = (arr: any) => {
  const updatedArr = [];

  for (let i = 0; i < arr.length; i++) {
    const obj = arr[i];
    const updatedObj: { [key: string]: any } = {};

    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        if (Array.isArray(obj[key])) {
          updatedObj[key] = obj[key];
        } else {
          updatedObj[key] = obj[key] === null ? "" : String(obj[key]);
        }
      }
    }
    updatedArr.push(updatedObj);
  }
  return updatedArr;
};

export const Time: any = () => {
  const current_time = new Date();

  const time = Math.floor(current_time.getTime() / 1000);

  return time;
};
