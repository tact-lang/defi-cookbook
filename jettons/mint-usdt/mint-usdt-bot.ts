import dotenv from "dotenv"
import path from "path"

dotenv.config({path: path.resolve(__dirname, ".env")})

import {Context, session, Telegraf} from "telegraf"

import qrcode from "qrcode"
import {message} from "telegraf/filters"
import {Address} from "@ton/ton"
import {getMintTransactionAsTonLink} from "./mint-usdt"

const MINT_PARAMETERS = {
    jettonMintAmount: process.env.MINT_AMOUNT ?? "100", // 100 TUSDT
    deployValueAmount: process.env.VALUE ?? "0.15", // 0.15 ton
}

// This is deployed in testnet patched Tact USDT Jetton,
// that allows mint for anyone, so you don't need to deploy your own jetton minter
const MINTER_ADDRESS = Address.parse("kQBEpNQPST_mYPpfoENd2abvEDb5WJnEpXxjufNHQNN9xuQI")

const main = async () => {
    const botToken = process.env.BOT_TOKEN ?? "bot_token"

    interface SessionData {
        awaitingAddress?: boolean
    }

    interface CustomContext extends Context {
        session: SessionData
    }

    const bot: Telegraf<CustomContext> = new Telegraf(botToken)

    bot.use(
        session({
            defaultSession: (): SessionData => ({
                awaitingAddress: false,
            }),
        }),
    )

    bot.command("info", ctx => {
        ctx.reply(
            "Bot that gives you 100 Tact USDT on testnet for testing purposes. Use /mint_usdt to start.",
        )
    })

    bot.command("mint_usdt", async ctx => {
        ctx.session.awaitingAddress = true
        await ctx.reply("Please send your wallet address:")
    })

    bot.on(message("text"), async ctx => {
        if (ctx.session.awaitingAddress) {
            const userAddressRaw = ctx.message.text
            let userAddress: Address

            // Validate the address format
            try {
                const parsedAddress = Address.parse(userAddressRaw)
                ctx.session.awaitingAddress = false
                userAddress = parsedAddress
            } catch (error) {
                await ctx.reply("Invalid address format. Please send a valid wallet address.")
                return
            }

            const mintTransactionLink = await getMintTransactionAsTonLink(
                userAddress,
                MINTER_ADDRESS,
                MINT_PARAMETERS,
            )
            console.log(mintTransactionLink)

            const qrCodeBuffer = await qrcode.toBuffer(mintTransactionLink)

            await ctx.replyWithPhoto(
                {source: qrCodeBuffer},
                {
                    caption: `Scan this QR code with your TON wallet or <a href="${mintTransactionLink}">click here</a> to mint Tact USDT in testnet.`,
                    parse_mode: "HTML",
                },
            )
        }
    })

    // Start the bot
    bot.launch()
    console.log("Bot is running...")
}

main().catch(error => {
    console.error("Error starting the bot:", error)
})
