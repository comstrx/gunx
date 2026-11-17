import { enroll } from "../../shared/enroll.ts";
import { account } from "./account.ts";
import { board } from "./board.ts";
import { login } from "./login.ts";

export const schema = [board, enroll, login, account];
