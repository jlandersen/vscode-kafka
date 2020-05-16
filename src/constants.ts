import * as path from "path";
import { Context } from "./context";

export const imagesPath = "images";

type DarkLightPath = { light: string; dark: string}

const getDarkLightPath = (fileName: string): DarkLightPath => {
    return {
        light: Context.current.asAbsolutePath(path.join(imagesPath, "light", fileName)),
        dark: Context.current.asAbsolutePath(path.join(imagesPath, "dark", fileName)),
    };
};

const getIconPath = (fileName: string): string => {
    return Context.current.asAbsolutePath(path.join(imagesPath, fileName));
};

export class Icons {
    public static get Server(): DarkLightPath {
        return getDarkLightPath("server.svg");
    }

    public static get ServerConnected(): DarkLightPath {
        return getDarkLightPath("server-connected.svg");
    }

    public static get Topic(): DarkLightPath {
        return getDarkLightPath("topic.svg");
    }

    public static get Group(): DarkLightPath {
        return getDarkLightPath("group.svg");
    }

    public static get Warning(): string {
        return getIconPath("warning.svg");
    }

    public static get Information(): DarkLightPath {
        return getDarkLightPath("information.svg");
    }
}
