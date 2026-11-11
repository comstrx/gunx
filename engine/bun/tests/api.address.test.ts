import { describe, expect, test as it } from "bun:test";
import * as api from "engine/api";
import * as error from "engine/error";

function reasonOf ( work: () => unknown ): string | undefined {

    try {

        work();

    } catch ( thrown ) {

        return error.isFault(thrown) ? thrown.reason : "not a fault";

    }

    return undefined;

}

describe("api address", () => {

    it("an address is trimmed to its origin and path", () => {

        expect(api.address(" https://api.example.com/v1/ ")).toBe("https://api.example.com/v1");
        expect(api.address("http://localhost:8100")).toBe("http://localhost:8100");
        expect(api.address("http://10.0.2.2:8100/")).toBe("http://10.0.2.2:8100");

    });
    it("a release refuses cleartext and private hosts unless declared insecure", () => {

        expect(api.address("https://api.example.com", { release: true })).toBe("https://api.example.com");

        for ( const exposed of ["http://api.example.com", "https://localhost:8100", "https://10.0.2.2:8100", "http://127.0.0.1"] ) {

            expect(reasonOf(() => api.address(exposed, { release: true }))).toBe("api.cleartext");

        }

        expect(api.address("http://10.0.0.5:8100", { release: true, insecure: true })).toBe("http://10.0.0.5:8100");

    });
    it("anything but a bare http or https url is refused", () => {

        for ( const wrong of ["ftp://files.example.com", "not a url", "https://api.example.com/?token=1", "https://api.example.com/#top", ""] ) {

            expect(reasonOf(() => api.address(wrong))).toBe("api.address");

        }

    });

});
