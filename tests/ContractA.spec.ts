import { Blockchain, printTransactionFees, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { ContractA } from '../wrappers/ContractA';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { ContractB } from '../wrappers/ContractB';
import { flattenTransaction } from '@ton/test-utils';

describe('ContractA', () => {
    let contractACode: Cell;
    let contractBCode: Cell;

    beforeAll(async () => {
        contractACode = await compile('ContractA');
        contractBCode = await compile('ContractB');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let contractA: SandboxContract<ContractA>;
    let contractB: SandboxContract<ContractB>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        contractB = blockchain.openContract(
            ContractB.createFromConfig(
                {
                    id: 0,
                    counter: 0,
                },
                contractBCode
            )
        );
        contractA = blockchain.openContract(
            ContractA.createFromConfig(
                {
                    id: 1,
                    counter: 0,
                    next_contract_address: contractB.address,
                },
                contractACode
            )
        );

        deployer = await blockchain.treasury('deployer');

        const deployResult1 = await contractA.sendDeploy(deployer.getSender(), toNano('0.05'));
        const deployResult2 = await contractB.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult1.transactions).toHaveTransaction({
            from: deployer.address,
            to: contractA.address,
            deploy: true,
            success: true,
        });
        expect(deployResult2.transactions).toHaveTransaction({
            from: deployer.address,
            to: contractB.address,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and contractA are ready to use
    });

    it('should increase counter', async () => {
        const increaseTimes = 3;
        for (let i = 0; i < increaseTimes; i++) {
            console.log(`increase ${i + 1}/${increaseTimes}`);

            const increaser = await blockchain.treasury('increaser' + i);

            const counterBefore = await contractA.getCounter();

            console.log('counter before increasing', counterBefore);

            const increaseBy = Math.floor(Math.random() * 100);

            console.log('increasing by', increaseBy);

            const increaseResult = await contractA.sendIncrease(increaser.getSender(), {
                increaseBy,
                value: toNano('0.05'),
            });

            expect(increaseResult.transactions).toHaveTransaction({
                from: increaser.address,
                to: contractA.address,
                success: true,
            });
            expect(increaseResult.transactions).toHaveTransaction({
                from: contractA.address,
                to: contractB.address,
                success: true,
            });

            const counterAfter = await contractA.getCounter();

            console.log('counter after increasing', counterAfter);

            expect(counterAfter).toBe(counterBefore + increaseBy);

            printTransactionFees(increaseResult.transactions);

            const allFees = increaseResult.transactions.reduce((acc, tx) => {
                return acc + tx.totalFees.coins;
            }, 0n)
            
            const lastTx = flattenTransaction(increaseResult.transactions[increaseResult.transactions.length - 1]);
            expect(lastTx.value).toBe(
                toNano('0.05') - allFees
            );
        }
    });
});
