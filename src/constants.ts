import * as path from "path";
import { Context } from "./context";

export const imagesPath = "images";

const getDarkLightPath = (fileName: string) => {
    return {
        light: Context.current.asAbsolutePath(path.join(imagesPath, "light", fileName)),
        dark: Context.current.asAbsolutePath(path.join(imagesPath, "dark", fileName)),
    };
};

const getIconPath = (fileName: string) => {
    return  Context.current.asAbsolutePath(path.join(imagesPath, fileName));
};

export class Icons {
    public static get Server() {
        return getDarkLightPath("server.svg");
    }

    public static get ServerConnected() {
        return getDarkLightPath("server-connected.svg");
    }

    public static get Topic() {
        return getDarkLightPath("topic.svg");
    }

    public static get Group() {
        return getDarkLightPath("group.svg");
    }

    public static get Warning() {
        return getIconPath("warning.svg");
    }

    public static get Information() {
        return getDarkLightPath("information.svg");
    }
}
